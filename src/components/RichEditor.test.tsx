import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RichEditor } from "./RichEditor";
import { createTableHtml } from "./richTable";

const execCommand = vi.fn();

function tableFromChange(onChange: ReturnType<typeof vi.fn>): HTMLTableElement {
  const html = onChange.mock.lastCall?.[0];
  if (typeof html !== "string") throw new Error("changed-html-missing");
  const host = document.createElement("div");
  host.innerHTML = html;
  const table = host.querySelector("table");
  if (!(table instanceof HTMLTableElement)) throw new Error("changed-table-missing");
  return table;
}

function firstTableCell(): HTMLElement {
  const cell = screen.getAllByText("내용").at(0);
  if (cell === undefined) throw new Error("table-cell-missing");
  return cell;
}

describe("RichEditor table controls", () => {
  afterEach(cleanup);

  beforeEach(() => {
    execCommand.mockReset();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
  });

  it("Given the table tool, when choosing a larger size, then it inserts that table", async () => {
    // Given
    const user = userEvent.setup();
    render(<RichEditor value="<p>업무</p>" onChange={vi.fn()} />);

    // When
    await user.click(screen.getByRole("button", { name: "표 삽입" }));
    await user.click(screen.getByRole("button", { name: "행 추가" }));

    // Then
    expect(screen.getByText("3행 × 2열")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "선택한 크기로 표 삽입" }));
    expect(execCommand).toHaveBeenCalledWith(
      "insertHTML",
      false,
      `${createTableHtml(3, 2)}<p><br></p>`,
    );
  });

  it("Given a table, when a cell is selected, then structural controls appear", async () => {
    // Given
    const user = userEvent.setup();
    render(<RichEditor value={createTableHtml(2, 2)} onChange={vi.fn()} />);

    // When
    await user.click(firstTableCell());

    // Then
    expect(screen.getByRole("button", { name: "아래에 행 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "현재 행 삭제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "오른쪽에 열 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "현재 열 삭제" })).toBeInTheDocument();
  });

  it("Given an active table cell, when adding a row and column, then the editor emits the new shape", async () => {
    // Given
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichEditor value={createTableHtml(2, 2)} onChange={onChange} />);
    await user.click(firstTableCell());

    // When
    await user.click(screen.getByRole("button", { name: "아래에 행 추가" }));
    await user.click(screen.getByRole("button", { name: "오른쪽에 열 추가" }));

    // Then
    const table = tableFromChange(onChange);
    expect(table.rows).toHaveLength(3);
    expect(table.rows.item(0)?.cells).toHaveLength(3);
  });

  it("Given a one-cell or merged table, when selecting its cell, then unsafe deletion is disabled", async () => {
    // Given
    const user = userEvent.setup();
    const merged = createTableHtml(1, 1).replace("<td>", '<td colspan="2">');
    const { rerender } = render(<RichEditor value={createTableHtml(1, 1)} onChange={vi.fn()} />);
    await user.click(screen.getByText("내용"));

    // When / Then
    expect(screen.getByRole("button", { name: "현재 행 삭제" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "현재 열 삭제" })).toBeDisabled();

    rerender(<RichEditor value={merged} onChange={vi.fn()} />);
    await user.click(screen.getByText("내용"));
    expect(screen.getByRole("button", { name: "아래에 행 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "오른쪽에 열 추가" })).toBeDisabled();
  });

  it("Given a selected table, when it is detached from the editor, then its structural controls disappear", async () => {
    // Given
    const user = userEvent.setup();
    render(<RichEditor value={createTableHtml(2, 2)} onChange={vi.fn()} />);
    await user.click(firstTableCell());
    const table = screen.getByRole("table");

    // When
    table.remove();

    // Then
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "선택한 표 편집" })).not.toBeInTheDocument();
    });
  });
});
