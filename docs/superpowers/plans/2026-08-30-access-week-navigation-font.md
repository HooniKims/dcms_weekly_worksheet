# Access, Week Navigation, and Paperlogy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Paperlogy to the site UI, simplify week navigation, hide an empty 말씀 및 기도 report row, and split contributor/admin password authentication.

**Architecture:** Preserve the repository boundary for loading entries by week and the fixed Google Sheets report CSS contract. Replace only the week-list presentation with a native selector, and replace Firebase email admin login with a password-verified callable that returns an admin custom token. Local demo passwords come from Vite development environment variables; deployed passwords remain server-only Firebase Secrets.

**Tech Stack:** React 19, TypeScript 5.9, Vitest/Testing Library, Vite, Firebase Auth/Functions/Firestore, CSS, self-hosted WOFF2.

---

### Task 1: Lock the UI and print font contracts

**Files:**
- Modify: `DESIGN.md`
- Create: `public/fonts/Paperlogy-4Regular.woff2`
- Create: `public/fonts/Paperlogy-5Medium.woff2`
- Create: `public/fonts/Paperlogy-7Bold.woff2`
- Modify: `src/styles/base.css`
- Modify: `src/styles/tokens.css`

- [ ] **Step 1: Add the Paperlogy screen-font contract to `DESIGN.md`**

Document that `--font-sohne` resolves to Paperlogy for application chrome while `.report-form`
continues to use `--report-font` and Malgun Gothic.

- [ ] **Step 2: Obtain the official Paperlogy webfont asset**

Download the official Regular, Medium, and Bold WOFF2 files into `public/fonts`, record their source
repository in `DESIGN.md`, and confirm `file public/fonts/Paperlogy-*.woff2` identifies WOFF2 fonts.

- [ ] **Step 3: Register the font without blocking first paint**

```css
@font-face {
  font-family: "Paperlogy";
  src: url("/fonts/Paperlogy-4Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Set `--font-sohne` to `Paperlogy, Pretendard, "Noto Sans KR", ui-sans-serif, system-ui, sans-serif`
and leave `--report-font` unchanged.

- [ ] **Step 4: Verify the production build includes the asset**

Run: `npm run build && test -f dist/fonts/Paperlogy-4Regular.woff2 && test -f dist/fonts/Paperlogy-5Medium.woff2 && test -f dist/fonts/Paperlogy-7Bold.woff2`

Expected: build exits 0 and the WOFF2 file exists under `dist/fonts`.

### Task 2: Hide an empty 말씀 및 기도 report row

**Files:**
- Modify: `src/components/ReportView.test.tsx`
- Modify: `src/components/ReportView.tsx`

- [ ] **Step 1: Write the failing report regression test**

Add an empty `말씀 및 기도` fixture plus another empty department and assert:

```tsx
expect(within(report).queryByRole("rowheader", { name: "말씀 및 기도" })).not.toBeInTheDocument();
expect(within(report).getByRole("rowheader", { name: "교육연구부" })).toBeInTheDocument();
expect(within(report).getByText("* 없음")).toBeInTheDocument();
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run: `npm test -- --run src/components/ReportView.test.tsx`

Expected: FAIL because the empty 말씀 및 기도 row is still present.

- [ ] **Step 3: Implement the report-only omission rule**

Inside the department mapping, compute:

```ts
const hasContent = Boolean(entry?.plainText.trim());
const omitEmpty = department.omitWhenEmpty || department.name === "말씀 및 기도";
if (omitEmpty && !hasContent) return null;
```

Do not remove the department from navigation or data snapshots.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run src/components/ReportView.test.tsx`

Expected: PASS.

### Task 3: Replace the long week list with a current-week selector

**Files:**
- Modify: `src/domain/week.ts`
- Modify: `src/domain/week.test.ts`
- Create: `src/components/WorkspaceNavigation.test.tsx`
- Modify: `src/components/WorkspaceNavigation.tsx`
- Modify: `src/styles/workspace.css`

- [ ] **Step 1: Write failing label tests**

```ts
expect(formatWeekOptionLabel(currentWeek)).toBe("2026년 8월 31일 (월) · 입력 주차");
expect(formatWeekOptionLabel(migratedWeek)).toBe("2026년 8월 24일 (월) · 이전 자료");
```

- [ ] **Step 2: Write a failing navigation interaction test**

Render `WorkspaceNavigation`, assert there is one combobox named `입력 날짜`, assert no week buttons
exist, select `2026-08-24`, and expect `onWeekChange("2026-08-24")`.

- [ ] **Step 3: Run focused tests and observe failures**

Run: `npm test -- --run src/domain/week.test.ts src/components/WorkspaceNavigation.test.tsx`

Expected: FAIL because the formatter and selector do not exist.

- [ ] **Step 4: Implement one shared `WeekSelector` component**

```tsx
function WeekSelector({ weeks, weekId, onWeekChange }: WeekSelectorProps) {
  return (
    <label className="week-selector">
      <span><CalendarBlank size={16} /> 입력 날짜</span>
      <select aria-label="입력 날짜" value={weekId}
        onChange={(event) => void onWeekChange(weekIdSchema.parse(event.target.value))}>
        {weeks.map((week) => (
          <option key={week.id} value={week.id}>{formatWeekOptionLabel(week)}</option>
        ))}
      </select>
    </label>
  );
}
```

Use it in desktop navigation and the mobile selectors. Remove the mapped week buttons.

- [ ] **Step 5: Style the compact current-week control**

Use existing spacing, radius, border, and type tokens. Make the select full width, at least 44px high,
and preserve the visible focus ring. Do not change the department list interaction.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run src/domain/week.test.ts src/components/WorkspaceNavigation.test.tsx`

Expected: PASS.

### Task 4: Preserve department content while changing weeks

**Files:**
- Create: `src/components/Workspace.test.tsx`
- Modify: `src/components/Workspace.tsx`

- [ ] **Step 1: Write a failing user-flow test**

Use a small in-memory `WorkspaceRepository` with two weeks. Render `Workspace`, select the second
date, choose `편집`, and assert the existing selected department content from that week appears in
the editor. Assert the department completion check is derived from the second week's entries.

- [ ] **Step 2: Run the test and identify any state mismatch**

Run: `npm test -- --run src/components/Workspace.test.tsx`

Expected: FAIL only if current department/draft handling does not satisfy the new selector flow.

- [ ] **Step 3: Make week change atomic**

Load the next snapshot, preserve the selected department when it exists in the next snapshot, fall
back to its first department otherwise, then replace snapshot/week/draft together. Preserve the active
report/edit tab. Expose a role=status message only when loading fails and leave the current state intact.

- [ ] **Step 4: Run the workspace test**

Run: `npm test -- --run src/components/Workspace.test.tsx`

Expected: PASS.

### Task 5: Split local contributor and admin passwords

**Files:**
- Modify: `.env`
- Modify: `.env.example`
- Modify: `src/vite-env.d.ts`
- Modify: `src/data/repository.ts`
- Modify: `src/data/localRepository.test.ts`
- Modify: `src/data/localRepository.ts`
- Create: `src/components/AdminDialog.test.tsx`
- Modify: `src/components/AdminDialog.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/LockScreen.tsx`

- [ ] **Step 1: Write failing local password tests**

```ts
await expect(localRepository.unlock("<site-password>")).resolves.toBeUndefined();
await expect(localRepository.unlock("<admin-password>")).rejects.toThrow("wrong-password");
await expect(localRepository.signInAdmin("<admin-password>")).resolves.toBeUndefined();
await expect(localRepository.signInAdmin("<site-password>")).rejects.toThrow("wrong-admin-password");
```

- [ ] **Step 2: Write a failing password-only admin dialog test**

Assert no email textbox exists, submit `<admin-password>`, verify `onSignIn("<admin-password>")`, and verify the week-date
form becomes visible.

- [ ] **Step 3: Run focused tests and observe failures**

Run: `npm test -- --run src/data/localRepository.test.ts src/components/AdminDialog.test.tsx`

Expected: FAIL because current credentials are `weekly` and email/password.

- [ ] **Step 4: Add local environment variables and type declarations**

```dotenv
VITE_LOCAL_SITE_PASSWORD=<site-password>
VITE_LOCAL_ADMIN_PASSWORD=<admin-password>
```

Declare both as required strings in `ImportMetaEnv`. Read them only in `localRepository`.

- [ ] **Step 5: Change the repository and dialog contracts**

Change `signInAdmin(email, password)` to `signInAdmin(password)`. Remove email state and input from
`AdminDialog`; map incorrect admin credentials to `관리자 비밀번호가 맞지 않습니다.`. Update the
demo hint to `개발 미리보기 비밀번호: <site-password>`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --run src/data/localRepository.test.ts src/components/AdminDialog.test.tsx src/components/LockScreen.test.tsx`

Expected: PASS.

### Task 6: Add Firebase admin-password custom-token authentication

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `src/data/firebaseRepository.ts`
- Modify: `.env.example`

- [ ] **Step 1: Define the server-only admin secret**

```ts
const adminPassword = defineSecret("ADMIN_PASSWORD");
```

- [ ] **Step 2: Implement the admin callable**

Add `unlockAdminWithPassword` with the same input schema and App Check enforcement as contributor
unlock. Compare the supplied password to `ADMIN_PASSWORD` without writing it to Firestore, then
return a custom token containing `{ role: "admin", admin: true }`.

- [ ] **Step 3: Replace Firebase email login**

Call `unlockAdminWithPassword`, parse its `{ customToken }` response with the existing response
schema, and use `signInWithCustomToken`. Remove `signInWithEmailAndPassword`.

- [ ] **Step 4: Document deployment secrets**

Add non-secret instructions to `.env.example` comments:

```text
firebase functions:secrets:set SITE_PASSWORD
firebase functions:secrets:set ADMIN_PASSWORD
```

- [ ] **Step 5: Build the functions and web app**

Run: `npm --prefix functions run build && npm run build`

Expected: both commands exit 0.

### Task 7: Verify the complete behavior on the real surface

**Files:**
- Modify as required by defects found during QA.
- Produce: `tmp/qa/access-week-navigation/` screenshots and notes.

- [ ] **Step 1: Run the complete automated gate**

Run: `npm test && npm run build && npx biome check <all changed source files>`

Expected: all tests pass, build exits 0, changed-file lint exits 0.

- [ ] **Step 2: Exercise the browser flow**

Use the real local development server to verify `<site-password>` unlock, visible latest input date, selecting an
older date, department completion marks, loaded editor content, password-only `<admin-password>` admin access,
and keyboard focus on both selectors.

- [ ] **Step 3: Verify computed fonts**

Assert application chrome resolves to Paperlogy and `.report-form` resolves to the Malgun Gothic
report stack. Confirm the font request succeeds with no console error.

- [ ] **Step 4: Verify report and print regressions**

Check an empty 말씀 및 기도 fixture is omitted, other empty departments keep `* 없음`, and an older
week containing a table/bold/underline still prints to one A4 portrait PDF without clipping.

- [ ] **Step 5: Record residual issues**

Name any pre-existing full-repository lint findings separately from changed-file results. Do not
change unrelated files solely to make the global lint command green.
