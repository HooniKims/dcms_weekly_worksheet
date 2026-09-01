import { z } from "zod";
import {
  type Department,
  defaultDepartments,
  departmentSchema,
  type Entry,
  entrySchema,
  type SearchResult,
  type Week,
  weekSchema,
} from "../domain/models";
import { matchesSearch, searchExcerpt } from "../domain/search";
import { formatKoreanDate, type WeekId, weekIdSchema } from "../domain/week";
import migrationIndex from "./migrated/index.json";
import type {
  SaveEntryInput,
  SaveResult,
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "./repository";
import { ArchivedWeekWriteError, LastActiveWeekError } from "./repository";

const storageKey = "weekly-work-progress-demo-v2";
const sessionKey = "weekly-access-v2";
const localSitePassword = import.meta.env.VITE_LOCAL_SITE_PASSWORD;
const localAdminPassword = import.meta.env.VITE_LOCAL_ADMIN_PASSWORD;

type LocalState = Readonly<{
  weeks: readonly Week[];
  archivedWeekIds: readonly WeekId[];
  entriesByWeek: Readonly<Record<string, readonly Entry[]>>;
  departments: readonly Department[];
}>;

const initialState: LocalState = {
  weeks: [],
  archivedWeekIds: [],
  entriesByWeek: {},
  departments: defaultDepartments,
};

const localStateSchema = z.object({
  weeks: z.array(weekSchema),
  archivedWeekIds: z.array(weekIdSchema).default([]),
  entriesByWeek: z.record(z.string(), z.array(entrySchema)),
  departments: z.array(departmentSchema).optional(),
});
const migrationIndexSchema = z.object({
  sourceSpreadsheetId: z.string().min(1),
  weeks: z.array(weekSchema),
});
const migratedWeeks = migrationIndexSchema.parse(migrationIndex).weeks;
const migratedEntryFiles = import.meta.glob("./migrated/2026-*.json", { import: "default" });

function mergedWeeks(localWeeks: readonly Week[]): readonly Week[] {
  const unique = new Map(migratedWeeks.map((week) => [week.id, week]));
  for (const week of localWeeks) unique.set(week.id, week);
  return [...unique.values()].sort((left, right) => right.id.localeCompare(left.id));
}

function partitionWeeks(state: LocalState): Readonly<{
  active: readonly Week[];
  archived: readonly Week[];
}> {
  const archivedIds = new Set(state.archivedWeekIds);
  const archivedAt = new Date(0).toISOString();
  const active: Week[] = [];
  const archived: Week[] = [];
  for (const week of mergedWeeks(state.weeks)) {
    if (archivedIds.has(week.id)) archived.push({ ...week, archivedAt });
    else active.push({ ...week, archivedAt: null });
  }
  return { active, archived };
}

async function loadWeekEntries(state: LocalState, weekId: string): Promise<readonly Entry[]> {
  const loadEntries = migratedEntryFiles[`./migrated/${weekId}.json`];
  const migratedEntries =
    loadEntries === undefined ? [] : z.array(entrySchema).parse(await loadEntries());
  const entries = new Map(migratedEntries.map((entry) => [entry.departmentId, entry]));
  for (const entry of state.entriesByWeek[weekId] ?? []) entries.set(entry.departmentId, entry);
  return [...entries.values()];
}

function readState(): LocalState {
  const stored = localStorage.getItem(storageKey);
  if (stored === null) return initialState;
  try {
    const parsed = localStateSchema.parse(JSON.parse(stored));
    return { ...parsed, departments: parsed.departments ?? defaultDepartments };
  } catch {
    return initialState;
  }
}

function activeDepartments(state: LocalState): Department[] {
  return [...state.departments]
    .filter((department) => department.active)
    .sort((left, right) => left.order - right.order);
}

function normalizedActiveDepartments(departments: readonly Department[]): Department[] {
  return departments.map((department, order) => ({ ...department, order, active: true }));
}

function updatedMasterDepartments(
  existing: readonly Department[],
  active: readonly Department[],
): Department[] {
  const activeIds = new Set(active.map((department) => department.id));
  return [
    ...active,
    ...existing
      .filter((department) => !activeIds.has(department.id))
      .map((department) => ({ ...department, active: false })),
  ];
}

function writeState(state: LocalState): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export const localRepository: WorkspaceRepository = {
  async unlock(password) {
    if (password !== localSitePassword) throw new Error("wrong-password");
    sessionStorage.setItem(sessionKey, "granted");
  },
  async logout() {
    sessionStorage.removeItem(sessionKey);
  },
  async restoreSession() {
    return sessionStorage.getItem(sessionKey) === "granted";
  },
  async signInAdmin(password) {
    if (password !== localAdminPassword) throw new Error("wrong-admin-password");
  },
  async load(weekId): Promise<WorkspaceSnapshot> {
    const state = readState();
    const { active: weeks, archived: archivedWeeks } = partitionWeeks(state);
    const selectedId = weekId ?? weeks[0]?.id ?? "";
    const activeSelectedId = weeks.some((week) => week.id === selectedId)
      ? selectedId
      : (weeks[0]?.id ?? "");
    return {
      weeks,
      archivedWeeks,
      departments: activeDepartments(state),
      entries: await loadWeekEntries(state, activeSelectedId),
    };
  },
  subscribeToWeek() {
    return () => undefined;
  },
  async saveEntry(input: SaveEntryInput): Promise<SaveResult> {
    const state = readState();
    if (state.archivedWeekIds.includes(input.weekId)) {
      throw new ArchivedWeekWriteError(input.weekId);
    }
    const weekEntries = await loadWeekEntries(state, input.weekId);
    const current = weekEntries.find((entry) => entry.departmentId === input.departmentId);
    const fallback: Entry = {
      departmentId: input.departmentId,
      htmlContent: "",
      plainText: "",
      version: 0,
      updatedAt: new Date().toISOString(),
      updatedByRole: "contributor",
    };
    const latest = current ?? fallback;
    if (latest.version !== input.expectedVersion) return { status: "conflict", latest };

    const entry: Entry = {
      ...latest,
      htmlContent: input.htmlContent,
      plainText: input.plainText,
      version: latest.version + 1,
      updatedAt: new Date().toISOString(),
      updatedByRole: "contributor",
    };
    const entries = weekEntries.filter((item) => item.departmentId !== input.departmentId);
    writeState({
      ...state,
      entriesByWeek: { ...state.entriesByWeek, [input.weekId]: [...entries, entry] },
    });
    return { status: "saved", entry };
  },
  async saveDepartments(weekId, departments): Promise<WorkspaceSnapshot> {
    const state = readState();
    const selectedWeek = mergedWeeks(state.weeks).find((week) => week.id === weekId);
    if (selectedWeek === undefined) return this.load(weekId);

    const active = normalizedActiveDepartments(departments);
    const updatedWeek: Week = { ...selectedWeek, departmentSnapshot: active };
    writeState({
      weeks: [updatedWeek, ...state.weeks.filter((week) => week.id !== weekId)],
      archivedWeekIds: state.archivedWeekIds,
      entriesByWeek: state.entriesByWeek,
      departments: updatedMasterDepartments(state.departments, active),
    });
    return this.load(weekId);
  },
  async createWeek(weekId: WeekId): Promise<Week> {
    const state = readState();
    const existing = mergedWeeks(state.weeks).find((week) => week.id === weekId);
    if (existing !== undefined) return existing;
    const week: Week = {
      id: weekId,
      dateLabel: formatKoreanDate(weekId),
      meetingTitle: "주간업무추진사항",
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      archivedAt: null,
      departmentSnapshot: activeDepartments(state),
    };
    writeState({
      weeks: [week, ...state.weeks],
      archivedWeekIds: state.archivedWeekIds,
      entriesByWeek: { ...state.entriesByWeek, [week.id]: [] },
      departments: state.departments,
    });
    return week;
  },
  async archiveWeek(weekId) {
    const state = readState();
    const { active } = partitionWeeks(state);
    if (!active.some((week) => week.id === weekId)) return this.load();
    if (active.length === 1) throw new LastActiveWeekError(weekId);
    writeState({ ...state, archivedWeekIds: [...state.archivedWeekIds, weekId] });
    return this.load();
  },
  async restoreWeek(weekId) {
    const state = readState();
    writeState({
      ...state,
      archivedWeekIds: state.archivedWeekIds.filter((archivedId) => archivedId !== weekId),
    });
    return this.load(weekId);
  },
  async search(query): Promise<readonly SearchResult[]> {
    if (!matchesSearch(query, query)) return [];

    const state = readState();
    const results: SearchResult[] = [];
    for (const week of partitionWeeks(state).active) {
      const entriesByDepartment = new Map(
        (await loadWeekEntries(state, week.id)).map((entry) => [entry.departmentId, entry]),
      );
      for (const department of week.departmentSnapshot.filter((item) => item.active)) {
        const entry = entriesByDepartment.get(department.id);
        const nameMatches = matchesSearch(department.name, query);
        const contentMatches = entry !== undefined && matchesSearch(entry.plainText, query);
        if (!nameMatches && !contentMatches) continue;
        results.push({
          weekId: week.id,
          dateLabel: week.dateLabel,
          departmentId: department.id,
          departmentName: department.name,
          excerpt:
            entry !== undefined && entry.plainText.length > 0
              ? searchExcerpt(entry.plainText, query)
              : department.name,
        });
        if (results.length === 50) return results;
      }
    }
    return results;
  },
  async rebuildSearchIndex() {},
};
