# Admin Week Target Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator choose and clearly see the active week that will be moved to trash without changing the workspace editing week.

**Architecture:** `Workspace` passes its active week collection through `AdminDialog` to `AdminWeekTrash`. `AdminWeekTrash` owns a dialog-local target ID, derives every visible label and archive request from the same `Week` object, and falls back to the newest remaining active week after the target is archived.

**Tech Stack:** React 19, TypeScript 5.9, Vitest, Testing Library, CSS custom properties, Vite

---

### Task 1: Lock the target-selection behavior with tests

**Files:**
- Modify: `src/components/AdminDialog.test.tsx`

- [ ] **Step 1: Add two active week fixtures and pass them to the dialog**

Define `activeWeeks` with the current `2026-08-31` week and another `2026-08-24` week. Replace the count-only prop with:

```tsx
activeWeeks,
```

- [ ] **Step 2: Write the failing selection test**

```tsx
it("Given several active weeks, when the administrator chooses another trash target, then every archive surface uses that week", async () => {
  const user = userEvent.setup();
  const onArchiveWeek = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.fn().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  dialog({ onArchiveWeek });
  await authenticate(user);

  await user.selectOptions(screen.getByLabelText("휴지통으로 이동할 주차"), "2026-08-24");

  expect(screen.getByText("현재 삭제 대상: 2026년 8월 24일")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "2026년 8월 24일을 휴지통으로 이동" }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("2026년 8월 24일"));
  expect(onArchiveWeek).toHaveBeenCalledWith("2026-08-24");
});
```

- [ ] **Step 3: Extend the pending-state test**

Assert that `휴지통으로 이동할 주차` is disabled together with archive and restore buttons while the archive promise is pending.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm test -- --run src/components/AdminDialog.test.tsx`

Expected: FAIL because `AdminDialog` has no `activeWeeks` prop and the target selector does not exist.

### Task 2: Implement one source of truth for the archive target

**Files:**
- Modify: `src/components/AdminWeekTrash.tsx`
- Modify: `src/components/AdminDialog.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/DemoAdminWeekTrashPreview.tsx`

- [ ] **Step 1: Replace count-only input with the active week collection**

Change the `AdminWeekTrash` contract to accept:

```tsx
activeWeeks: readonly Week[];
```

Pass `workspace.snapshot.weeks` from `Workspace` through `AdminDialog`, and update the local preview fixture.

- [ ] **Step 2: Add the dialog-local target state**

In `AdminWeekTrash`, initialize from the workspace-selected week and derive the target object:

```tsx
const [archiveTargetWeekId, setArchiveTargetWeekId] = useState(selectedWeekId);
const archiveTargetWeek =
  activeWeeks.find((week) => week.id === archiveTargetWeekId) ?? activeWeeks[0];
```

Use an effect to select `activeWeeks[0]` only when the current target disappears after an archive or external refresh.

- [ ] **Step 3: Render the selector and synchronized labels**

Add a labeled native select populated from `activeWeeks`, followed by:

```tsx
<p className="week-trash-target" aria-live="polite">
  현재 삭제 대상: {archiveTargetWeek.dateLabel}
</p>
```

The action label becomes `${archiveTargetWeek.dateLabel}을 휴지통으로 이동`. The confirmation message and `onArchiveWeek` call use that same object.

- [ ] **Step 4: Keep operations mutually exclusive**

Disable the select, archive button, and restore buttons whenever `busyAction !== null`. Keep the last-active-week check based on `activeWeeks.length <= 1`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm test -- --run src/components/AdminDialog.test.tsx src/components/Workspace.test.tsx`

Expected: all tests pass.

### Task 3: Match the existing administrator design contract

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/styles/workspace.css`

- [ ] **Step 1: Update the week-trash contract**

Document that the admin dialog contains an independent active-week target selector, that all labels and requests share one target, and that changing it never changes the editor week.

- [ ] **Step 2: Style the selector and target callout with existing tokens**

Use the existing input height, hairline, `--radius-input`, `--spacing-*`, Paperlogy, and peach/brown emphasis tokens. On narrow screens, keep the selector and action full-width with natural Korean wrapping.

- [ ] **Step 3: Run component and static checks**

Run:

```bash
npm test -- --run src/components/AdminDialog.test.tsx src/components/Workspace.test.tsx
npm run lint
npm run build
```

Expected: tests, Biome, and production build all exit 0.

### Task 4: Verify the real surface and deploy

**Files:**
- Modify: `src/components/DemoAdminWeekTrashPreview.tsx`
- Evidence: `.omo/evidence/admin-week-target-selector-2026-09-01/`

- [ ] **Step 1: Capture complete fresh browser evidence**

At 1280px, 768px, and 375px, capture the authenticated administrator dialog with the selector at its default target and after choosing another target. Verify the outside selected-week context does not change.

- [ ] **Step 2: Run the visual QA dual-review gate**

Dispatch independent design-system/functional and visual/CJK reviewers over every fresh capture. Fix and recapture until both return PASS without blockers.

- [ ] **Step 3: Run final verification**

Run:

```bash
npm test -- --run
npm run lint
npm run build
npm --prefix functions run lint
npm --prefix functions run build
git diff --check
```

Expected: all commands exit 0; the normal suite may skip Firestore emulator-only tests.

- [ ] **Step 4: Commit, push, and deploy Vercel production**

```bash
git add DESIGN.md docs/superpowers/plans/2026-09-01-admin-week-target-selector.md src/components/AdminDialog.test.tsx src/components/AdminDialog.tsx src/components/AdminWeekTrash.tsx src/components/DemoAdminWeekTrashPreview.tsx src/components/Workspace.tsx src/styles/workspace.css
git commit -m "Add admin week trash target selector"
git push origin main
vercel deploy --prod --yes
```

- [ ] **Step 5: Smoke-test the live deployment without mutating production data**

Confirm the stable production URL returns HTTP 200, the deployed admin chunk includes the target selector labels, and unauthenticated archive requests still return 401.
