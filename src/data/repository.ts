import type { Department, Entry, SearchResult, Week } from "../domain/models";
import type { WeekId } from "../domain/week";

export type WorkspaceSnapshot = Readonly<{
  weeks: readonly Week[];
  archivedWeeks: readonly Week[];
  departments: readonly Department[];
  entries: readonly Entry[];
}>;

export type SaveEntryInput = Readonly<{
  weekId: WeekId;
  departmentId: string;
  htmlContent: string;
  plainText: string;
  expectedVersion: number;
}>;

export type SaveResult =
  | Readonly<{ status: "saved"; entry: Entry }>
  | Readonly<{ status: "conflict"; latest: Entry }>;

export class LastActiveWeekError extends Error {
  readonly name = "LastActiveWeekError";

  constructor(readonly weekId: WeekId) {
    super(`cannot archive the last active week ${weekId}`);
  }
}

export class ArchivedWeekWriteError extends Error {
  readonly name = "ArchivedWeekWriteError";

  constructor(readonly weekId: WeekId) {
    super(`cannot write to archived week ${weekId}`);
  }
}

export interface WorkspaceRepository {
  unlock(password: string): Promise<void>;
  logout(): Promise<void>;
  restoreSession(): Promise<boolean>;
  signInAdmin(password: string): Promise<void>;
  load(weekId?: WeekId): Promise<WorkspaceSnapshot>;
  subscribeToWeek(weekId: WeekId, onEntries: (entries: readonly Entry[]) => void): () => void;
  saveEntry(input: SaveEntryInput): Promise<SaveResult>;
  saveDepartments(weekId: WeekId, departments: readonly Department[]): Promise<WorkspaceSnapshot>;
  createWeek(weekId: WeekId): Promise<Week>;
  archiveWeek(weekId: WeekId): Promise<WorkspaceSnapshot>;
  restoreWeek(weekId: WeekId): Promise<WorkspaceSnapshot>;
  search(query: string): Promise<readonly SearchResult[]>;
  rebuildSearchIndex(): Promise<void>;
}
