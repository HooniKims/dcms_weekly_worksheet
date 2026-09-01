# Admin Week Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator-only, recoverable week trash flow that preserves entries and revisions while removing archived weeks from active lists, saving, and search.

**Architecture:** Keep week documents and all subcollections in place, adding a nullable `archivedAt` state. Split active and archived weeks at repository boundaries, perform archive/restore and search-index updates in administrator server transactions, and let the workspace controller choose the next safe active week after archiving. Local preview storage mirrors the behavior with `archivedWeekIds` so migrated fixtures remain recoverable.

**Tech Stack:** React 19, TypeScript 5.9, Zod 4, Firebase Auth/Firestore/Functions, Vercel Node API, Vitest, Testing Library, Bun, Biome.

---

### Task 1: Domain and repository contract

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/data/repository.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/components/Workspace.test.tsx`

- [ ] **Step 1: Write failing contract tests**

Add fixtures that include an `archivedWeeks` array and repository spies for `archiveWeek` and `restoreWeek`. Add a model test proving a legacy week without `archivedAt` parses as active and an archived week accepts an ISO timestamp.

```ts
expect(weekSchema.parse(legacyWeek).archivedAt).toBeNull();
expect(weekSchema.parse({ ...legacyWeek, archivedAt: "2026-09-01T00:00:00.000Z" }).archivedAt)
  .toBe("2026-09-01T00:00:00.000Z");
```

- [ ] **Step 2: Run tests to verify red**

Run: `bun run test -- src/domain/models.test.ts src/App.test.tsx src/components/Workspace.test.tsx`

Expected: FAIL because the week schema and repository methods do not exist.

- [ ] **Step 3: Extend the typed contract**

Add `archivedAt` with a legacy-safe default and expose archived weeks separately.

```ts
export const weekSchema = z.object({
  // existing fields
  archivedAt: z.string().datetime().nullable().default(null),
});

export type WorkspaceSnapshot = Readonly<{
  weeks: readonly Week[];
  archivedWeeks: readonly Week[];
  departments: readonly Department[];
  entries: readonly Entry[];
}>;

export interface WorkspaceRepository {
  // existing methods
  archiveWeek(weekId: WeekId): Promise<WorkspaceSnapshot>;
  restoreWeek(weekId: WeekId): Promise<WorkspaceSnapshot>;
}
```

- [ ] **Step 4: Run targeted tests**

Run: `bun run test -- src/domain/models.test.ts src/App.test.tsx src/components/Workspace.test.tsx`

Expected: PASS for contract fixtures.

### Task 2: Pure week lifecycle decisions

**Files:**
- Create: `functions/src/weekLifecycle.ts`
- Create: `functions/src/weekLifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Cover missing week, already archived, last-active protection, successful archive, already active restore, and successful restore using Given/When/Then test names.

```ts
expect(planWeekArchive({ targetExists: true, targetArchived: false, activeWeekCount: 1 }))
  .toEqual({ kind: "last-active" });
expect(planWeekArchive({ targetExists: true, targetArchived: false, activeWeekCount: 2 }))
  .toEqual({ kind: "archive" });
expect(planWeekRestore({ targetExists: true, targetArchived: true }))
  .toEqual({ kind: "restore" });
```

- [ ] **Step 2: Run tests to verify red**

Run: `bun run test -- functions/src/weekLifecycle.test.ts`

Expected: FAIL because the planner is absent.

- [ ] **Step 3: Implement exhaustive planners and typed errors**

Use discriminated unions for archive and restore decisions. Export `WeekNotFoundError` and `LastActiveWeekError`; do not throw bare errors for expected lifecycle failures.

```ts
export type WeekArchiveDecision =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "unchanged" }>
  | Readonly<{ kind: "last-active" }>
  | Readonly<{ kind: "archive" }>;
```

- [ ] **Step 4: Run lifecycle tests**

Run: `bun run test -- functions/src/weekLifecycle.test.ts`

Expected: PASS.

### Task 3: Atomic Firebase archive and restore

**Files:**
- Modify: `functions/src/weeks.ts`
- Modify: `functions/src/searchFirestore.ts`
- Modify: `functions/src/searchPlanning.ts`
- Modify: `functions/src/search.test.ts`
- Modify: `functions/src/index.ts`
- Modify: `api/workspace.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Write failing search and lifecycle integration tests**

Extend week records with archival state and prove archived weeks produce no search upserts. Add API action-schema coverage for `archiveWeek` and `restoreWeek`. Add a saving rule assertion that archived parents reject entry writes.

```ts
const plan = planSearchIndexRebuild({
  weeks: [{ ...week, archivedAt: "2026-09-01T00:00:00.000Z" }],
  entries,
  existingIds,
  updatedAt,
});
expect(plan.upserts).toEqual([]);
expect(plan.deleteIds).toEqual(existingIds);
```

- [ ] **Step 2: Run tests to verify red**

Run: `bun run test -- functions/src/weekLifecycle.test.ts functions/src/search.test.ts functions/src/security.test.ts`

Expected: FAIL on archived search behavior and missing actions.

- [ ] **Step 3: Implement server transactions**

In `functions/src/weeks.ts`, add administrator lifecycle functions that read the target week, active-week set, related search index, and entries before writing. Archive sets `archivedAt` to a server timestamp and deletes the week’s search documents in the same transaction. Restore sets `archivedAt` to `null` and rebuilds deterministic search index documents from preserved entries in the same transaction.

Map domain errors to `not-found`/404 and `failed-precondition`/409 responses in both Cloud Functions and Vercel API. Require an admin token before parsing or executing the action.

- [ ] **Step 4: Exclude archived weeks everywhere**

Make `refreshWeekSearchIndex`, `refreshEntrySearchIndex`, and `rebuildAllSearchIndexes` treat archived weeks as absent. Update the Vercel `saveEntry` transaction to read the parent week and reject archived or missing weeks. Update Firestore rules:

```text
function activeWeek(weekId) {
  let week = get(/databases/$(database)/documents/weeks/$(weekId));
  return week.exists()
    && (!week.data.keys().hasAny(['archivedAt']) || week.data.archivedAt == null);
}
```

Require `activeWeek(weekId)` for contributor entry create/update.

- [ ] **Step 5: Run server tests and build**

Run: `bun run test -- functions/src/weekLifecycle.test.ts functions/src/search.test.ts functions/src/security.test.ts && bunx tsc -p functions/tsconfig.json --noEmit`

Expected: PASS with no TypeScript diagnostics.

### Task 4: Firebase and local repository behavior

**Files:**
- Modify: `src/data/firebaseRepository.ts`
- Modify: `src/data/firebaseRepository.test.ts`
- Modify: `src/data/localRepository.ts`
- Modify: `src/data/localRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

For Firebase, prove load splits active and archived documents, archive calls the authenticated backend action then reloads the next active week, and restore calls its action while returning both lists. For local storage, prove a migrated week can be archived without deleting its entries, disappears from search, and returns with its content after restore.

```ts
await localRepository.archiveWeek(selectedWeekId);
expect((await localRepository.load()).weeks.some(({ id }) => id === selectedWeekId)).toBe(false);
expect((await localRepository.search("기존 업무")).some(({ weekId }) => weekId === selectedWeekId))
  .toBe(false);
await localRepository.restoreWeek(selectedWeekId);
expect((await localRepository.load(selectedWeekId)).entries).toEqual(before.entries);
```

- [ ] **Step 2: Run tests to verify red**

Run: `bun run test -- src/data/firebaseRepository.test.ts src/data/localRepository.test.ts`

Expected: FAIL because archival parsing and repository methods are absent.

- [ ] **Step 3: Implement Firebase parsing and actions**

Parse missing or null Firestore `archivedAt` as active and timestamps as ISO strings. `loadWorkspace` sorts all weeks by date, splits them, and only loads entries for an active selected week. Add strict Zod response parsing for archive and restore backend actions.

- [ ] **Step 4: Implement local tombstones**

Add `archivedWeekIds` with an empty default to `LocalState`. Split `mergedWeeks` by the ID set, exclude archived IDs from local search, block last-active archive, and remove the tombstone on restore. Never delete `entriesByWeek`.

- [ ] **Step 5: Run repository tests**

Run: `bun run test -- src/data/firebaseRepository.test.ts src/data/localRepository.test.ts`

Expected: PASS.

### Task 5: Workspace controller and administrator UI

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/components/useWorkspaceController.ts`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/AdminDialog.tsx`
- Modify: `src/components/AdminDialog.test.tsx`
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/styles/workspace.css`

- [ ] **Step 1: Write failing UI tests**

Add tests for the archive confirmation text, last-active disabled state, busy state, archive success, archive failure, archived-week list, and restore. Add an end-to-end workspace component test proving the selected archived week is replaced by the next latest active week.

```ts
expect(screen.getByRole("button", { name: /2026년 9월 7일.*휴지통/ })).toBeEnabled();
await user.click(screen.getByRole("button", { name: /휴지통/ }));
expect(confirmSpy).toHaveBeenCalledOnce();
expect(repository.archiveWeek).toHaveBeenCalledWith("2026-09-07");
```

- [ ] **Step 2: Run tests to verify red**

Run: `bun run test -- src/components/AdminDialog.test.tsx src/components/Workspace.test.tsx`

Expected: FAIL because the controls and callbacks are absent.

- [ ] **Step 3: Implement controller transitions**

Add archive and restore generations so stale requests cannot overwrite later selection. On archive, apply the returned snapshot, select its first active week and first active department, clear the draft, and reset save state. On restore, merge active/archived week lists while preserving the current selected week and entries.

- [ ] **Step 4: Implement accessible administrator controls**

Add a `주차 관리` section using existing card, danger-button, and Phosphor icon patterns. Confirmation copy must name the selected date and explain preservation. Render `휴지통` only when nonempty, with a date-labelled restore button per row. Disable archive when only one active week remains and disable lifecycle actions while busy.

- [ ] **Step 5: Document and style the state**

Update `DESIGN.md` with the administrator week-trash contract. Add only token-based responsive styles for the week-management row and archived list; preserve the existing modal width and mobile wrapping.

- [ ] **Step 6: Run UI tests**

Run: `bun run test -- src/components/AdminDialog.test.tsx src/components/Workspace.test.tsx`

Expected: PASS.

### Task 6: Full verification and deployment

**Files:**
- Verify all changed files
- Evidence: `.omo/evidence/admin-week-trash-2026-09-01/`

- [ ] **Step 1: Run strict checks**

Run: `bunx biome check <changed-files> && bun run test && bun run build && git diff --check`

Expected: all tests pass, production build exits 0, and the diff has no whitespace errors.

- [ ] **Step 2: Run real-browser scenarios**

At 1280×900, 768×900, and 375×812: authenticate in the local preview, open administrator tools, move a non-final week to trash after confirmation, verify automatic selection fallback, verify absence from date selector and search, restore it, and verify it returns. Capture every state after the final edit.

- [ ] **Step 3: Run dual visual QA**

Dispatch the required read-only design-system/functional reviewer and visual/CJK reviewer against all fresh captures. Fix and recapture until both return PASS with no blockers.

- [ ] **Step 4: Commit and deploy**

Commit the implementation and tests as one feature commit, push `main`, deploy the Vercel production target, deploy Firebase Functions and Firestore rules when changed, then verify the production alias returns HTTP 200 and serves the new lifecycle labels.
