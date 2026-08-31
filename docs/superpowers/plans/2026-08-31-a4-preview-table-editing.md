# A4 Preview and Table Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an administrator A4 preview-before-print flow, raise the print top margin by exactly 2mm, and let contributors insert and reshape rich-text tables through simple cell-based controls.

**Architecture:** Keep the printable report itself unchanged and wrap it in a focused `PrintPreviewDialog` that owns preview and print behavior. Move table DOM mutations into a small pure helper module so `RichEditor` only tracks the selected cell, saved range, and visible controls. Preserve the existing HTML storage format and sanitization boundary.

**Tech Stack:** React 19, TypeScript, browser `contentEditable` DOM APIs, Vitest, Testing Library, Vite CSS, Chrome print-to-PDF.

---

## File map

- Modify `DESIGN.md`: add the approved A4 preview, 4.54mm top margin, and adjustable-table interaction contracts.
- Create `src/components/richTable.ts`: build rectangular table HTML and perform safe row/column mutations around an active cell.
- Create `src/components/richTable.test.ts`: verify 1×1/2×2/10×10 creation, row/column mutations, last-row/column protection, and merged-cell protection.
- Modify `src/components/RichEditor.tsx`: save the editor range, open the size picker, track the active cell, and expose easy row/column controls.
- Create `src/components/RichEditor.test.tsx`: verify the visible insertion and post-selection editing flow.
- Create `src/components/PrintPreviewDialog.tsx`: render the current saved report in an accessible modal and invoke print only from its explicit action.
- Create `src/components/PrintPreviewDialog.test.tsx`: verify preview content, print, close, Escape, and focus restoration.
- Modify `src/components/WorkspaceNavigation.tsx`: replace direct `window.print()` with an `onPrintPreview` callback.
- Modify `src/components/Workspace.tsx`: own preview-open state and supply the current week, snapshot departments, and saved entries.
- Modify `src/components/Workspace.test.tsx`: verify administrator-only preview behavior and absence of an immediate print call.
- Modify `src/styles/workspace.css`: style the preview surface, size picker, and cell editing actions with existing tokens.
- Modify `src/styles/print.css`: print only the preview report while the dialog is active and increase top margin from 2.54mm to 4.54mm.

### Task 1: Lock the approved design contract

**Files:**
- Modify: `DESIGN.md:429-526`

- [ ] **Step 1: Add the approved interaction and print rules**

Append the following rules to the printable-report and workspace contracts:

```markdown
- The administrator `A4 인쇄` action opens an accessible preview dialog for the selected week's
  saved report. Only the dialog's explicit `인쇄하기` action invokes the browser print flow; closing
  the dialog returns focus to the trigger.
- Print output uses a 4.54mm top margin, exactly 2mm more than the former 0.10in margin. Other page
  margins and the one-page report geometry remain unchanged.
- The rich editor inserts rectangular tables from 1×1 through 10×10. Selecting a normal table cell
  reveals controls that add a row below, delete the active row, add a column to the right, or delete
  the active column. The final row or column and merged-cell tables cannot be structurally removed.
```

- [ ] **Step 2: Verify the documentation diff**

Run: `git diff --check -- DESIGN.md`

Expected: exit 0 with no whitespace errors.

### Task 2: Add tested rectangular-table DOM operations

**Files:**
- Create: `src/components/richTable.ts`
- Create: `src/components/richTable.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create DOM fixtures and assert the public contract:

```ts
import { describe, expect, it } from "vitest";
import {
  addColumnAfter,
  addRowAfter,
  createTableHtml,
  deleteActiveColumn,
  deleteActiveRow,
  getTableSelection,
} from "./richTable";

function tableFrom(html: string): HTMLTableElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  const table = host.querySelector("table");
  if (!(table instanceof HTMLTableElement)) throw new Error("table-missing");
  return table;
}

describe("richTable", () => {
  it("creates the requested rectangular table size", () => {
    const table = tableFrom(createTableHtml(3, 4));
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0]?.cells).toHaveLength(4);
  });

  it("adds and removes rows and columns around the active cell", () => {
    const table = tableFrom(createTableHtml(2, 2));
    const cell = table.rows[0]?.cells[0];
    if (!(cell instanceof HTMLTableCellElement)) throw new Error("cell-missing");
    const addedRowCell = addRowAfter(cell);
    expect(table.rows).toHaveLength(3);
    const addedColumnCell = addColumnAfter(addedRowCell ?? cell);
    expect(table.rows[0]?.cells).toHaveLength(3);
    expect(deleteActiveRow(addedColumnCell ?? cell)).toBeDefined();
    expect(deleteActiveColumn(table.rows[0]?.cells[1] ?? cell)).toBeDefined();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.cells).toHaveLength(2);
  });

  it("protects the final row and column and rejects merged tables", () => {
    const oneCell = tableFrom(createTableHtml(1, 1)).rows[0]?.cells[0];
    if (!(oneCell instanceof HTMLTableCellElement)) throw new Error("cell-missing");
    expect(deleteActiveRow(oneCell)).toBeUndefined();
    expect(deleteActiveColumn(oneCell)).toBeUndefined();
    oneCell.colSpan = 2;
    expect(getTableSelection(oneCell)?.editable).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the red state**

Run: `bunx vitest run src/components/richTable.test.ts`

Expected: FAIL because `./richTable` does not exist.

- [ ] **Step 3: Implement the table helper module**

Implement these exact exports:

```ts
export type TableSelection = Readonly<{
  cell: HTMLTableCellElement;
  table: HTMLTableElement;
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
  editable: boolean;
}>;

export function createTableHtml(rows: number, columns: number): string;
export function getTableSelection(cell: HTMLTableCellElement): TableSelection | undefined;
export function addRowAfter(cell: HTMLTableCellElement): HTMLTableCellElement | undefined;
export function deleteActiveRow(cell: HTMLTableCellElement): HTMLTableCellElement | undefined;
export function addColumnAfter(cell: HTMLTableCellElement): HTMLTableCellElement | undefined;
export function deleteActiveColumn(cell: HTMLTableCellElement): HTMLTableCellElement | undefined;
```

Clamp creation dimensions to 1–10. Generate `tbody`, `tr`, and `td` only, with `내용` in newly inserted tables and `<br>` in newly added cells. `getTableSelection` must return `editable: false` when any table cell has `rowSpan > 1` or `colSpan > 1`, or when rows do not share the same cell count. Mutation functions must return the closest surviving or newly created cell, and return `undefined` without mutation when the table is not editable or the final row/column would be removed.

- [ ] **Step 4: Run the helper tests**

Run: `bunx vitest run src/components/richTable.test.ts`

Expected: all helper tests PASS.

### Task 3: Build easy insertion and cell-edit controls

**Files:**
- Modify: `src/components/RichEditor.tsx`
- Create: `src/components/RichEditor.test.tsx`
- Modify: `src/styles/workspace.css`

- [ ] **Step 1: Write failing editor interaction tests**

Cover these user-visible behaviors with Testing Library:

```ts
it("opens a size picker and inserts the chosen table", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<RichEditor value="<p>업무</p>" onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: "표 삽입" }));
  expect(screen.getByText("2행 × 2열")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "행 추가" }));
  await user.click(screen.getByRole("button", { name: "선택한 크기로 표 삽입" }));
  expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("<table"));
  expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("<tr"));
});

it("shows cell controls after a table cell is selected", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<RichEditor value={createTableHtml(2, 2)} onChange={onChange} />);
  await user.click(screen.getAllByText("내용")[0]);
  expect(screen.getByRole("button", { name: "아래에 행 추가" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 행 삭제" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "오른쪽에 열 추가" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "현재 열 삭제" })).toBeInTheDocument();
});
```

Also test 1 and 10 limits, actual row/column mutation, disabling the final row/column, and disabling all structural controls for merged tables.

- [ ] **Step 2: Run the editor tests and confirm the red state**

Run: `bunx vitest run src/components/RichEditor.test.tsx`

Expected: FAIL because the size picker and active-cell controls are absent.

- [ ] **Step 3: Implement the editor state and controls**

Inside `RichEditor`, add:

```ts
const shellRef = useRef<HTMLDivElement>(null);
const savedRangeRef = useRef<Range>();
const [tablePickerOpen, setTablePickerOpen] = useState(false);
const [tableRows, setTableRows] = useState(2);
const [tableColumns, setTableColumns] = useState(2);
const [activeCell, setActiveCell] = useState<HTMLTableCellElement>();
const tableSelection = activeCell === undefined ? undefined : getTableSelection(activeCell);
```

Save a cloned selection range when it is inside the editor. Before inserting, restore that range, call `runCommand("insertHTML", createTableHtml(tableRows, tableColumns) + "<p><br></p>")`, then call `onChange(editor.innerHTML)`. On editor click, use `event.target.closest("td, th")` only when the cell belongs to the current editor. A document `pointerdown` listener clears the active cell only when the target is outside `shellRef`.

Render a `.table-size-popover` with separate row and column steppers. Use these exact accessible labels:

```tsx
<button aria-label="행 줄이기">−</button>
<button aria-label="행 추가">+</button>
<button aria-label="열 줄이기">−</button>
<button aria-label="열 추가">+</button>
<output aria-live="polite">{tableRows}행 × {tableColumns}열</output>
<button aria-label="선택한 크기로 표 삽입">표 삽입</button>
```

When `tableSelection` exists, render `.table-edit-actions` with the four approved labels. Use the helper module for every mutation, update `activeCell` with its returned cell, call `onChange(editor.innerHTML)`, and focus the resulting cell. Disable deletion at one row/column and disable all four actions when `editable` is false.

- [ ] **Step 4: Style the controls with existing tokens**

Add compact, wrapping toolbar styles. The size popover uses `position: absolute`, a white surface, hairline border, small radius, and subtle shadow. The editor shell becomes `position: relative`. Text labels remain visible next to icons on desktop and wrap below 640px. Do not add new colors, shadows, or spacing values.

- [ ] **Step 5: Run editor and helper tests**

Run: `bunx vitest run src/components/richTable.test.ts src/components/RichEditor.test.tsx`

Expected: all tests PASS.

### Task 4: Add preview-before-print

**Files:**
- Create: `src/components/PrintPreviewDialog.tsx`
- Create: `src/components/PrintPreviewDialog.test.tsx`
- Modify: `src/components/WorkspaceNavigation.tsx`
- Modify: `src/components/Workspace.tsx`
- Modify: `src/components/Workspace.test.tsx`
- Modify: `src/styles/workspace.css`
- Modify: `src/styles/print.css`

- [ ] **Step 1: Write failing dialog and workspace tests**

The dialog test must render a real report and assert:

```ts
const print = vi.fn();
render(
  <PrintPreviewDialog
    week={week}
    departments={departments}
    entries={entries}
    onClose={vi.fn()}
    onPrint={print}
  />,
);
expect(screen.getByRole("dialog", { name: "A4 인쇄 미리보기" })).toBeInTheDocument();
expect(screen.getByRole("table", { name: /주간업무추진사항/ })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "인쇄하기" }));
expect(print).toHaveBeenCalledOnce();
```

Add close-button and Escape assertions. Extend the existing administrator Workspace test so clicking `A4 인쇄` opens the dialog and `window.print` remains uncalled until `인쇄하기` is clicked.

- [ ] **Step 2: Run the preview tests and confirm the red state**

Run: `bunx vitest run src/components/PrintPreviewDialog.test.tsx src/components/Workspace.test.tsx`

Expected: FAIL because the dialog does not exist and the header calls `window.print` directly.

- [ ] **Step 3: Implement `PrintPreviewDialog`**

Use this public interface:

```ts
type PrintPreviewDialogProps = Readonly<{
  week: Week;
  departments: readonly DepartmentSnapshot[];
  entries: readonly Entry[];
  onClose: () => void;
  onPrint?: () => void;
}>;
```

The component renders `.print-preview-backdrop` and a `role="dialog"`, `aria-modal="true"`, `aria-label="A4 인쇄 미리보기"` surface. It contains one `ReportView`, `닫기`, and `인쇄하기`. Default `onPrint` to `window.print`. On mount, add `print-preview-active` to `document.body`, remember the previously focused element, and register Escape. Cleanup removes the body class, removes the listener, and restores focus.

- [ ] **Step 4: Wire Workspace state**

Change `WorkspaceHeader` to accept `onPrintPreview: () => void` and call it instead of `window.print`. Add:

```ts
const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
```

Render `PrintPreviewDialog` when open, using `workspace.selectedWeek`, `workspace.weekDepartments`, and `workspace.snapshot.entries`. Closing or logout removes the dialog through the normal workspace lifecycle.

- [ ] **Step 5: Style screen preview and print isolation**

Add screen styles that center the A4 document inside a scrollable dialog while keeping controls sticky and visible. In `src/styles/print.css`, set:

```css
@page {
  size: A4 portrait;
  margin: 4.54mm 0.01in 0.04in;
}

@media print {
  body.print-preview-active .workspace-header,
  body.print-preview-active .mobile-selectors,
  body.print-preview-active .workspace-grid,
  body.print-preview-active .print-preview-controls {
    display: none;
  }

  body.print-preview-active .print-preview-backdrop,
  body.print-preview-active .print-preview-dialog,
  body.print-preview-active .print-preview-document {
    position: static;
    display: block;
    width: auto;
    max-width: none;
    height: auto;
    max-height: none;
    margin: 0;
    padding: 0;
    overflow: visible;
    background: var(--print-paper);
    box-shadow: none;
  }
}
```

Keep the existing 756px print report width and all other report tokens unchanged.

- [ ] **Step 6: Run preview and workspace tests**

Run: `bunx vitest run src/components/PrintPreviewDialog.test.tsx src/components/Workspace.test.tsx`

Expected: all tests PASS.

### Task 5: Full verification, visual QA, and deployment

**Files:**
- Verify all files above; do not add production code unless QA finds a blocker.

- [ ] **Step 1: Run static and automated validation**

Run:

```bash
bunx biome check DESIGN.md src/components/richTable.ts src/components/richTable.test.ts src/components/RichEditor.tsx src/components/RichEditor.test.tsx src/components/PrintPreviewDialog.tsx src/components/PrintPreviewDialog.test.tsx src/components/WorkspaceNavigation.tsx src/components/Workspace.tsx src/components/Workspace.test.tsx src/styles/workspace.css src/styles/print.css
bun run test
bun run build
git diff --check
```

Expected: formatting/type checks exit 0, all tests pass, and Vite production build succeeds.

- [ ] **Step 2: Manually exercise the exact browser flows**

Using the local real browser:

1. Authenticate as administrator.
2. Stay on the `편집` tab and click `A4 인쇄`.
3. Confirm the selected week's A4 report appears before any print dialog.
4. Click `인쇄하기` and confirm the system print dialog is invoked.
5. Insert a 3×4 table, click its center cell, add a row below, add a column right, delete that row, and delete that column.
6. Confirm the toolbar appears immediately after cell selection and the editor reports unsaved changes.
7. Save and open A4 preview; confirm the resulting table layout matches.

- [ ] **Step 3: Capture responsive and A4 evidence**

Capture the preview dialog and active table controls at 375px, 768px, and 1280px. Generate a real Chrome A4 PDF with the selected week. Confirm `pdfinfo` reports one A4 page, the title has at least the additional 2mm top clearance, the right border is intact, and the 66:660 ratio is unchanged.

- [ ] **Step 4: Run independent visual QA**

Dispatch fresh read-only functional and CJK visual reviewers over the same current build and full capture set. Any blocking finding requires a source fix, new captures, and fresh reviewers.

- [ ] **Step 5: Deploy and verify production**

Run `vercel deploy --prod --yes`, wait for Ready, open `https://dcms-weekly-worksheet.vercel.app/`, and repeat the preview-open and cell-control smoke checks. Verify the production CSS contains `margin:4.54mm` for `@page`.

- [ ] **Step 6: Commit and push the completed feature**

After the working tree contains only the approved feature, its tests, and design/plan updates:

```bash
git add DESIGN.md docs/superpowers/specs/2026-08-31-a4-preview-table-editing-design.md docs/superpowers/plans/2026-08-31-a4-preview-table-editing.md src/components/richTable.ts src/components/richTable.test.ts src/components/RichEditor.tsx src/components/RichEditor.test.tsx src/components/PrintPreviewDialog.tsx src/components/PrintPreviewDialog.test.tsx src/components/WorkspaceNavigation.tsx src/components/Workspace.tsx src/components/Workspace.test.tsx src/styles/workspace.css src/styles/print.css
git commit -m "Preview A4 reports and edit table structure"
git push origin main
```

Expected: one atomic commit on `main`, a clean working tree, and the remote branch at the new commit.
