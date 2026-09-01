type ArchiveInput = {
  readonly targetExists: boolean;
  readonly targetArchived: boolean;
  readonly activeWeekCount: number;
};

type RestoreInput = {
  readonly targetExists: boolean;
  readonly targetArchived: boolean;
};

export type ArchiveDecision =
  | { readonly kind: "archive" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "not_found" }
  | { readonly kind: "last_active" };

export type RestoreDecision =
  | { readonly kind: "restore" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "not_found" };

export function planWeekArchive(input: ArchiveInput): ArchiveDecision {
  if (!input.targetExists) return { kind: "not_found" };
  if (input.targetArchived) return { kind: "unchanged" };
  if (input.activeWeekCount <= 1) return { kind: "last_active" };
  return { kind: "archive" };
}

export function planWeekRestore(input: RestoreInput): RestoreDecision {
  if (!input.targetExists) return { kind: "not_found" };
  if (!input.targetArchived) return { kind: "unchanged" };
  return { kind: "restore" };
}
