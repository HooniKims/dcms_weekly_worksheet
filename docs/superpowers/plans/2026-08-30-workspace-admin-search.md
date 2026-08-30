# Workspace administration and search implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logout, a stable editor-first workspace, manual week creation, week-scoped department administration, and fast archive search with result navigation.

**Architecture:** Existing weeks retain immutable department snapshots while an administrator updates the selected week plus the active master department list used by later manual weeks. A derived Firestore search index uses normalized Korean bigrams for candidate lookup, with exact substring filtering in repositories; the local repository provides the same behavior over migrated and local data.

**Tech Stack:** React 19, TypeScript 5.9, Vite, Vitest/Testing Library, Firebase Auth/Firestore/Functions v2, Zod, Biome.

---

## File map

- Create `src/domain/search.ts`: query normalization, bigram generation, and excerpts.
- Create `src/domain/search.test.ts`: pure search behavior.
- Modify `src/domain/models.ts`: `SearchResult` and `SearchIndexRecord` schemas/types.
- Modify `src/data/repository.ts`: logout, search, and department administration contracts.
- Modify `src/data/localRepository.ts`: persistent master departments, snapshots, soft delete, search, logout.
- Modify `src/data/localRepository.test.ts`: local end-to-end repository scenarios.
- Modify `src/data/firebaseRepository.ts`: Firebase logout, search query, admin callable adapters.
- Modify `functions/src/index.ts`: remove scheduler, add department update and index rebuild callables, maintain index after entry writes.
- Modify `functions/src/weeks.ts`: create only active master departments and initial empty index records.
- Create `functions/src/search.ts`: backend index builders and Firestore rebuild logic.
- Create `functions/src/search.test.ts`: backend normalization/index fixtures.
- Modify `firestore.rules`: authenticated search-index reads and blocked client writes.
- Modify `src/App.tsx` and create/modify `src/App.test.tsx`: own logout and return to lock screen.
- Modify `src/components/Workspace.tsx`: edit-first state, week-snapshot navigation, search result navigation, admin refresh.
- Modify `src/components/WorkspaceNavigation.tsx`: accept selected-week departments.
- Create `src/components/WorkspaceSearch.tsx` and test: debounced accessible search results.
- Modify `src/components/AdminDialog.tsx` and test: week creation plus department list editing.
- Modify `src/styles/workspace.css` and `src/styles/tokens.css`: stable desktop tracks and new controls.
- Modify `DESIGN.md`: record the approved interaction and snapshot/search contracts.

### Task 1: Typed search domain

- [ ] Add failing tests to `src/domain/search.test.ts` for normalization, two-character grams, Korean substring match, and a bounded excerpt.
- [ ] Run `npm test -- src/domain/search.test.ts`; expect failures because the module is absent.
- [ ] Implement this public API in `src/domain/search.ts`:

```ts
export function normalizeSearchText(value: string): string;
export function searchGrams(value: string): readonly string[];
export function matchesSearch(recordText: string, query: string): boolean;
export function searchExcerpt(plainText: string, query: string, maxLength?: number): string;
```

- [ ] Add strict Zod schemas and readonly types in `src/domain/models.ts` for records and UI results.
- [ ] Re-run the focused test and `npx biome check src/domain/search.ts src/domain/search.test.ts src/domain/models.ts`; expect green.

### Task 2: Repository contract and local behavior

- [ ] Add failing tests in `src/data/localRepository.test.ts` that prove: logout invalidates restoration; saving departments changes only the selected week and master list; removed departments retain entries; a later created week inherits the new list; an older week stays unchanged; partial department/content search returns navigable results.
- [ ] Run `npm test -- src/data/localRepository.test.ts`; expect missing-method failures.
- [ ] Extend `WorkspaceRepository` with:

```ts
logout(): Promise<void>;
saveDepartments(weekId: WeekId, departments: readonly Department[]): Promise<WorkspaceSnapshot>;
search(query: string): Promise<readonly SearchResult[]>;
rebuildSearchIndex(): Promise<void>;
```

- [ ] Extend local state to persist master departments and week overrides, parse old storage safely, and use the selected week's snapshot for search labels.
- [ ] Implement soft delete by retaining omitted master records with `active: false`; never remove `entriesByWeek` data.
- [ ] Run the focused repository tests and changed-file Biome checks; expect green.

### Task 3: Trusted Firebase administration and search index

- [ ] Add failing backend tests for active-only week snapshots, index records for empty and populated departments, rename/reorder behavior, and rebuild coverage.
- [ ] Run the functions test command from `functions/package.json`; expect missing behavior failures.
- [ ] Remove `onSchedule`, `createNextWeek`, and scheduler-only date helpers/exports.
- [ ] Add strict callable inputs for an ordered active department list and expose admin-only `updateDepartments` and `rebuildSearchIndex` functions.
- [ ] In one Firestore batch/transaction, upsert active master departments, mark omitted masters inactive, replace only the selected week snapshot, and update/delete that week's derived index records.
- [ ] Update the entry-write trigger to archive revisions and independently refresh the affected search index record.
- [ ] Update manual week creation to copy active departments and create empty department-name index records.
- [ ] Run backend tests, build, and lint; expect green.

### Task 4: Firebase client adapter and rules

- [ ] Add adapter-level failing tests or boundary tests for parsing search index records and callable results.
- [ ] Implement `logout()` with Firebase Auth `signOut`, `saveDepartments()` through the admin callable followed by `load(weekId)`, indexed `search()` with `array-contains` plus exact filtering, and `rebuildSearchIndex()` through the callable.
- [ ] Update Firestore rules:

```text
match /searchIndex/{recordId} {
  allow read: if contributor();
  allow write: if false;
}
```

- [ ] Run adapter tests, TypeScript build, and changed-file Biome checks; expect green.

### Task 5: Logout, edit-first selection, and week snapshots

- [ ] Add failing component tests proving the first rendered workspace surface is the editor, logout returns to `LockScreen`, and changing weeks selects the same department when present or the first snapshot department otherwise.
- [ ] Run the focused tests; expect report-first and missing-logout failures.
- [ ] Add `App.handleLogout`, clear `weekly-work-session` in `finally`, reset ready state, and pass `onLogout` into `Workspace`.
- [ ] Set the initial tab to `edit`; derive `weekDepartments` from `selectedWeek.departmentSnapshot`; use it in navigation, mobile selection, editor selection, and post-admin refresh.
- [ ] Add the header logout action with the existing Phosphor icon set.
- [ ] Run focused tests and changed-file Biome checks; expect green.

### Task 6: Archive search UI and navigation

- [ ] Add failing `WorkspaceSearch` tests for the two-character threshold, 250 ms debounce, loading/error/empty states, result content, and click callback.
- [ ] Run the focused tests; expect missing component failure.
- [ ] Implement an accessible combobox/search dialog using the repository `search` method and a monotonically increasing request ID to ignore stale results.
- [ ] Wire result selection to `changeWeek(result.weekId, result.departmentId)` and force the `edit` tab.
- [ ] Run focused tests and changed-file Biome checks; expect green.

### Task 7: Administrator department manager

- [ ] Expand `AdminDialog.test.tsx` with separate failing scenarios for add, rename, move, remove, duplicate/empty validation, save, and manual week creation without scheduler copy.
- [ ] Run the focused test; expect missing controls and callbacks.
- [ ] Extend props with selected week label/departments, `onSaveDepartments`, and `onRebuildSearchIndex`.
- [ ] Implement accessible row actions, stable IDs for new departments, normalized order on save, and soft-delete semantics in the repository boundary.
- [ ] Refresh the workspace from the returned snapshot and safely select the first remaining department when needed.
- [ ] Run focused tests and changed-file Biome checks; expect green.

### Task 8: Stable desktop layout and design contract

- [ ] Record baseline left/right editor edges at 1280 px for two weeks with different content lengths.
- [ ] Update workspace CSS so header/grid use `width: min(100%, var(--layout-workspace-max))`, grid tracks remain fixed, `.workspace-main` uses `scrollbar-gutter: stable`, and edit/search/admin surfaces use the existing tokens.
- [ ] Add search and department-manager responsive styles without changing the A4 report selectors.
- [ ] Append the approved logout, editor-first, snapshot administration, manual-week, and search rules to `DESIGN.md`.
- [ ] Run changed-file Biome checks and `npm run build`; expect green.

### Task 9: Backfill and full verification

- [ ] Run the index rebuild against the local/emulated Firebase data and verify existing migrated content becomes searchable.
- [ ] Run `npm test`, the functions test/build commands, `npm run build`, and changed-file lint; record any unrelated existing full-repo lint issues separately.
- [ ] In a real browser at 1280 px, execute logout, editor-first entry, width stability, manual week creation, department rename/add/reorder/remove, historical preservation, future inheritance, and two search-result navigation scenarios.
- [ ] Export a representative report to A4 PDF and verify the report layout, table/bold/underline formatting, and page count did not regress.
- [ ] Run `/visual-qa` on fresh desktop/mobile/search/admin/report captures and require two independent read-only PASS verdicts.

