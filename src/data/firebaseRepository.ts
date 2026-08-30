import { signInWithCustomToken, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  type QueryDocumentSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import {
  type Department,
  defaultDepartments,
  departmentSchema,
  departmentSnapshotSchema,
  type Entry,
  entrySchema,
  searchIndexRecordSchema,
  searchResultSchema,
  type Week,
  weekSchema,
} from "../domain/models";
import { matchesSearch, normalizeSearchText, searchExcerpt, searchGrams } from "../domain/search";
import { type WeekId, weekIdSchema } from "../domain/week";
import { auth, cloudFunctions, db } from "./firebaseClient";
import type {
  SaveEntryInput,
  SaveResult,
  WorkspaceRepository,
  WorkspaceSnapshot,
} from "./repository";

const searchCandidateLimit = 200;
const searchResultLimit = 50;
const useVercelApi = import.meta.env.VITE_BACKEND_PROVIDER === "vercel";
const unlockResponseSchema = z.object({ customToken: z.string().min(1) }).strict();
const backendEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: z.string().min(1) }).strict(),
]);
const departmentUpdateResponseSchema = z
  .object({ updated: z.number().int().nonnegative(), indexStatus: z.enum(["fresh", "stale"]) })
  .strict();
const createWeekResponseSchema = z.object({ created: z.boolean() }).strict();
const rebuildSearchIndexResponseSchema = z
  .object({ indexed: z.number().int().nonnegative(), deleted: z.number().int().nonnegative() })
  .strict();
const saveResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), entry: entrySchema }).strict(),
  z.object({ status: z.literal("conflict"), latest: entrySchema }).strict(),
]);
const rawDepartmentSchema = departmentSchema.omit({ id: true }).strict();
const rawEntrySchema = entrySchema
  .omit({ updatedAt: true })
  .extend({ updatedAt: z.unknown() })
  .strict();
const rawWeekSchema = z
  .object({
    date: weekIdSchema,
    dateLabel: z.string(),
    meetingTitle: z.string(),
    createdBy: z.enum(["scheduler", "admin", "migration"]),
    createdAt: z.unknown(),
    departmentSnapshot: z.array(departmentSnapshotSchema.strict()),
  })
  .strict();

export class InvalidFirebaseTimestampError extends Error {
  readonly name = "InvalidFirebaseTimestampError";

  constructor(readonly value: unknown) {
    super("invalid Firebase timestamp");
  }
}

export class CreatedWeekUnavailableError extends Error {
  readonly name = "CreatedWeekUnavailableError";

  constructor(readonly weekId: WeekId) {
    super(`created week ${weekId} was not returned by Firestore`);
  }
}

function toIsoString(value: unknown): string {
  if (typeof value === "string") return dateToIsoString(new Date(value), value);
  if (typeof value === "object" && value !== null) {
    const toDate = Reflect.get(value, "toDate");
    if (typeof toDate === "function") {
      const date = Reflect.apply(toDate, value, []);
      if (date instanceof Date) return dateToIsoString(date, value);
    }
  }
  throw new InvalidFirebaseTimestampError(value);
}

function dateToIsoString(date: Date, source: unknown): string {
  if (Number.isNaN(date.getTime())) throw new InvalidFirebaseTimestampError(source);
  return date.toISOString();
}

function parseDepartment(id: string, data: Readonly<Record<string, unknown>>): Department {
  return departmentSchema.parse({ id, ...rawDepartmentSchema.parse(data) });
}

function parseEntry(id: string, data: Readonly<Record<string, unknown>>): Entry {
  const raw = rawEntrySchema.parse(data);
  return entrySchema.parse({ ...raw, departmentId: id, updatedAt: toIsoString(raw.updatedAt) });
}

function parseWeek(id: string, data: Readonly<Record<string, unknown>>): Week {
  const raw = rawWeekSchema.parse(data);
  return weekSchema.parse({ id, ...raw, createdAt: toIsoString(raw.createdAt) });
}

function parseSearchRecord(data: Readonly<Record<string, unknown>>) {
  return searchIndexRecordSchema.parse({ ...data, updatedAt: toIsoString(data.updatedAt) });
}

async function loadWorkspace(weekId?: WeekId): Promise<WorkspaceSnapshot> {
  const [weeksSnapshot, departmentsSnapshot] = await Promise.all([
    getDocs(query(collection(db, "weeks"), orderBy("date", "desc"))),
    getDocs(query(collection(db, "departments"), orderBy("order"))),
  ]);
  const weeks = weeksSnapshot.docs.map((weekDocument) =>
    parseWeek(weekDocument.id, weekDocument.data()),
  );
  const departments = departmentsSnapshot.empty
    ? defaultDepartments
    : departmentsSnapshot.docs
        .map((department) => parseDepartment(department.id, department.data()))
        .filter((department) => department.active);
  const selectedWeek = weeks.find((week) => week.id === weekId) ?? weeks.at(0);
  const entries =
    selectedWeek === undefined
      ? []
      : (await getDocs(collection(db, "weeks", selectedWeek.id, "entries"))).docs.map((entry) =>
          parseEntry(entry.id, entry.data()),
        );
  return { weeks, departments, entries };
}

function sortedSearchResults(
  records: readonly ReturnType<typeof parseSearchRecord>[],
  queryText: string,
) {
  return records
    .filter((record) => matchesSearch(record.normalizedText, queryText))
    .map((record) =>
      searchResultSchema.parse({
        weekId: record.weekId,
        dateLabel: record.dateLabel,
        departmentId: record.departmentId,
        departmentName: record.departmentName,
        excerpt:
          record.plainText.length > 0
            ? searchExcerpt(record.plainText, queryText)
            : record.departmentName,
      }),
    )
    .slice(0, searchResultLimit);
}

function searchCandidatesQuery(firstGram: string, cursor?: QueryDocumentSnapshot) {
  const searchIndex = collection(db, "searchIndex");
  const constraints = [
    where("grams", "array-contains", firstGram),
    orderBy("weekId", "desc"),
    orderBy("departmentId", "asc"),
  ];
  return cursor === undefined
    ? query(searchIndex, ...constraints, limit(searchCandidateLimit))
    : query(searchIndex, ...constraints, startAfter(cursor), limit(searchCandidateLimit));
}

async function backendCall(
  action: string,
  data: unknown,
  authenticated: boolean,
): Promise<unknown> {
  if (!useVercelApi) {
    return (await httpsCallable(cloudFunctions, action)(data)).data;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authenticated) {
    const token = await auth.currentUser?.getIdToken();
    if (token === undefined) throw new Error("authentication-required");
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch("/api/workspace", {
    method: "POST",
    headers,
    body: JSON.stringify({ action, data }),
  });
  const envelope = backendEnvelopeSchema.parse(await response.json());
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data;
}

export const firebaseRepository: WorkspaceRepository = {
  async unlock(password) {
    const result = await backendCall("unlockWithSharedPassword", { password }, false);
    const { customToken } = unlockResponseSchema.parse(result);
    await signInWithCustomToken(auth, customToken);
  },
  async logout() {
    await signOut(auth);
  },
  async restoreSession() {
    await auth.authStateReady();
    return auth.currentUser !== null;
  },
  async signInAdmin(password) {
    const result = await backendCall("unlockAdminWithPassword", { password }, false);
    const { customToken } = unlockResponseSchema.parse(result);
    await signInWithCustomToken(auth, customToken);
  },
  load: loadWorkspace,
  subscribeToWeek(weekId, onEntries) {
    return onSnapshot(collection(db, "weeks", weekId, "entries"), (snapshot) => {
      onEntries(snapshot.docs.map((entry) => parseEntry(entry.id, entry.data())));
    });
  },
  async saveEntry(input: SaveEntryInput): Promise<SaveResult> {
    if (useVercelApi) {
      return saveResultSchema.parse(await backendCall("saveEntry", input, true));
    }
    const entryReference = doc(db, "weeks", input.weekId, "entries", input.departmentId);
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(entryReference);
      const latest: Entry = snapshot.exists()
        ? parseEntry(snapshot.id, snapshot.data())
        : {
            departmentId: input.departmentId,
            htmlContent: "",
            plainText: "",
            version: 0,
            updatedAt: "",
            updatedByRole: "contributor",
          };
      if (latest.version !== input.expectedVersion) return { status: "conflict", latest };
      const entry: Entry = {
        ...latest,
        htmlContent: input.htmlContent,
        plainText: input.plainText,
        version: latest.version + 1,
        updatedAt: new Date().toISOString(),
        updatedByRole: "contributor",
      };
      transaction.set(entryReference, { ...entry, updatedAt: serverTimestamp() });
      return { status: "saved", entry };
    });
  },
  async saveDepartments(weekId, departments) {
    const result = await backendCall("updateDepartments", { weekId, departments }, true);
    departmentUpdateResponseSchema.parse(result);
    return loadWorkspace(weekId);
  },
  async createWeek(weekId) {
    const result = await backendCall("createWeek", { weekId }, true);
    createWeekResponseSchema.parse(result);
    const loaded = await loadWorkspace(weekId);
    const week = loaded.weeks.find((item) => item.id === weekId);
    if (week === undefined) throw new CreatedWeekUnavailableError(weekId);
    return week;
  },
  async search(queryText) {
    const normalizedQuery = normalizeSearchText(queryText);
    const firstGram = searchGrams(normalizedQuery)[0];
    if (firstGram === undefined) return [];
    const records: ReturnType<typeof parseSearchRecord>[] = [];
    let cursor: QueryDocumentSnapshot | undefined;
    let exactMatchCount = 0;
    while (exactMatchCount < searchResultLimit) {
      const candidates = await getDocs(searchCandidatesQuery(firstGram, cursor));
      const pageRecords = candidates.docs.map((candidate) => parseSearchRecord(candidate.data()));
      records.push(...pageRecords);
      exactMatchCount += pageRecords.filter((record) =>
        matchesSearch(record.normalizedText, normalizedQuery),
      ).length;
      if (candidates.docs.length < searchCandidateLimit) break;
      const lastCandidate = candidates.docs.at(-1);
      if (lastCandidate === undefined) break;
      cursor = lastCandidate;
    }
    return sortedSearchResults(records, normalizedQuery);
  },
  async rebuildSearchIndex() {
    const result = await backendCall("rebuildSearchIndex", undefined, true);
    rebuildSearchIndexResponseSchema.parse(result);
  },
};
