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
  document.body.append(host);
  const table = host.querySelector("table");
  if (!(table instanceof HTMLTableElement)) throw new Error("table-missing");
  return table;
}

function cellAt(table: HTMLTableElement, rowIndex: number, columnIndex: number) {
  const cell = table.rows.item(rowIndex)?.cells.item(columnIndex);
  if (!(cell instanceof HTMLTableCellElement)) throw new Error("cell-missing");
  return cell;
}

describe("richTable", () => {
  it("Given a requested size, when creating a table, then it returns that rectangular shape", () => {
    // Given / When
    const table = tableFrom(createTableHtml(3, 4));

    // Then
    expect(table.rows).toHaveLength(3);
    expect(table.rows.item(0)?.cells).toHaveLength(4);
  });

  it("Given an active cell, when adding a row and column, then it inserts them after the cell", () => {
    // Given
    const table = tableFrom(createTableHtml(2, 2));
    const firstCell = cellAt(table, 0, 0);

    // When
    const addedRowCell = addRowAfter(firstCell);
    if (addedRowCell === undefined) throw new Error("added-row-cell-missing");
    const addedColumnCell = addColumnAfter(addedRowCell);

    // Then
    expect(table.rows).toHaveLength(3);
    expect(table.rows.item(0)?.cells).toHaveLength(3);
    expect(addedRowCell.parentElement).toBe(table.rows.item(1));
    expect(addedColumnCell?.cellIndex).toBe(1);
  });

  it("Given a rectangular table, when deleting an active row and column, then it keeps the closest cell active", () => {
    // Given
    const table = tableFrom(createTableHtml(3, 3));

    // When
    const rowCell = deleteActiveRow(cellAt(table, 1, 1));
    if (rowCell === undefined) throw new Error("row-cell-missing");
    const columnCell = deleteActiveColumn(rowCell);

    // Then
    expect(table.rows).toHaveLength(2);
    expect(table.rows.item(0)?.cells).toHaveLength(2);
    expect(columnCell).toBe(cellAt(table, 1, 1));
  });

  it("Given a final dimension or merged table, when inspecting edits, then structural deletion is protected", () => {
    // Given
    const table = tableFrom(createTableHtml(1, 1));
    const cell = cellAt(table, 0, 0);

    // When / Then
    expect(deleteActiveRow(cell)).toBeUndefined();
    expect(deleteActiveColumn(cell)).toBeUndefined();
    cell.colSpan = 2;
    expect(getTableSelection(cell)?.editable).toBe(false);
  });

  it("Given dimensions outside the supported range, when creating a table, then it clamps them to one through ten", () => {
    // Given / When
    const smallest = tableFrom(createTableHtml(0, 0));
    const largest = tableFrom(createTableHtml(11, 11));

    // Then
    expect(smallest.rows).toHaveLength(1);
    expect(smallest.rows.item(0)?.cells).toHaveLength(1);
    expect(largest.rows).toHaveLength(10);
    expect(largest.rows.item(0)?.cells).toHaveLength(10);
  });

  it("Given a selected table is removed, when its former cell is inspected, then detached content cannot be edited", () => {
    // Given
    const table = tableFrom(createTableHtml(2, 2));
    const cell = cellAt(table, 0, 0);
    table.remove();

    // When / Then
    expect(getTableSelection(cell)).toBeUndefined();
    expect(addRowAfter(cell)).toBeUndefined();
  });
});
