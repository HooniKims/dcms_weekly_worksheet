import type { Department, Entry, SearchResult, Week } from "../domain/models";
import type { WeekId } from "../domain/week";

export type WorkspaceSnapshot = Readonly<{
  weeks: readonly Week[];
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
  search(query: string): Promise<readonly SearchResult[]>;
  rebuildSearchIndex(): Promise<void>;
}
