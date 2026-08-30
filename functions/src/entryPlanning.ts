import type { DepartmentRecord } from "./searchPlanning.js";

type EntryTriggerInput = {
  readonly beforeVersion: number | null;
  readonly afterExists: boolean;
};

export type EntryTriggerPlan = {
  readonly archiveVersions: readonly number[];
  readonly refreshIndex: true;
};

export function planEntryTrigger(input: EntryTriggerInput): EntryTriggerPlan {
  return {
    archiveVersions: input.beforeVersion !== null && input.afterExists ? [input.beforeVersion] : [],
    refreshIndex: true,
  };
}

export type SnapshotIndexAction =
  | {
      readonly kind: "upsert";
      readonly department: DepartmentRecord;
      readonly plainText: string;
    }
  | { readonly kind: "delete" };

export function planSnapshotIndexAction(
  snapshot: readonly DepartmentRecord[],
  departmentId: string,
  entryPlainText: string | null,
): SnapshotIndexAction {
  const department = snapshot.find(({ id }) => id === departmentId);
  if (department === undefined) return { kind: "delete" };
  return { kind: "upsert", department, plainText: entryPlainText ?? "" };
}
