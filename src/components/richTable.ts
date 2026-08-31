const tableSizeMinimum = 1;
const tableSizeMaximum = 10;

export type TableSelection = Readonly<{
  cell: HTMLTableCellElement;
  table: HTMLTableElement;
  rowIndex: number;
  columnIndex: number;
  rowCount: number;
  columnCount: number;
  editable: boolean;
}>;

function clampTableSize(value: number): number {
  return Math.min(tableSizeMaximum, Math.max(tableSizeMinimum, Math.trunc(value)));
}

function emptyCell(cell: HTMLTableCellElement): void {
  cell.append(document.createElement("br"));
}

function cellAt(
  table: HTMLTableElement,
  rowIndex: number,
  columnIndex: number,
): HTMLTableCellElement | undefined {
  const cell = table.rows.item(rowIndex)?.cells.item(columnIndex);
  return cell instanceof HTMLTableCellElement ? cell : undefined;
}

export function createTableHtml(rows: number, columns: number): string {
  const rowCount = clampTableSize(rows);
  const columnCount = clampTableSize(columns);
  const rowHtml = `<tr>${"<td>내용</td>".repeat(columnCount)}</tr>`;
  return `<table><tbody>${rowHtml.repeat(rowCount)}</tbody></table>`;
}

export function getTableSelection(cell: HTMLTableCellElement): TableSelection | undefined {
  if (!cell.isConnected) return undefined;
  const table = cell.closest("table");
  const row = cell.parentElement;
  if (!(table instanceof HTMLTableElement) || !(row instanceof HTMLTableRowElement)) {
    return undefined;
  }

  const rows = Array.from(table.rows);
  const columnCount = rows[0]?.cells.length ?? 0;
  const rectangular =
    columnCount > 0 && rows.every((tableRow) => tableRow.cells.length === columnCount);
  const merged = rows.some((tableRow) =>
    Array.from(tableRow.cells).some((tableCell) => tableCell.rowSpan > 1 || tableCell.colSpan > 1),
  );

  return {
    cell,
    table,
    rowIndex: row.rowIndex,
    columnIndex: cell.cellIndex,
    rowCount: rows.length,
    columnCount,
    editable: rectangular && !merged,
  };
}

export function addRowAfter(cell: HTMLTableCellElement): HTMLTableCellElement | undefined {
  const selection = getTableSelection(cell);
  const row = cell.parentElement;
  const section = row?.parentElement;
  if (
    selection === undefined ||
    !selection.editable ||
    !(row instanceof HTMLTableRowElement) ||
    !(section instanceof HTMLTableSectionElement)
  ) {
    return undefined;
  }

  const newRow = section.insertRow(row.sectionRowIndex + 1);
  for (let index = 0; index < selection.columnCount; index += 1) {
    emptyCell(newRow.insertCell());
  }
  const nextCell = newRow.cells.item(selection.columnIndex);
  return nextCell instanceof HTMLTableCellElement ? nextCell : undefined;
}

export function deleteActiveRow(cell: HTMLTableCellElement): HTMLTableCellElement | undefined {
  const selection = getTableSelection(cell);
  const row = cell.parentElement;
  if (
    selection === undefined ||
    !selection.editable ||
    selection.rowCount <= tableSizeMinimum ||
    !(row instanceof HTMLTableRowElement)
  ) {
    return undefined;
  }

  const targetRowIndex = Math.min(selection.rowIndex, selection.rowCount - 2);
  row.remove();
  return cellAt(selection.table, targetRowIndex, selection.columnIndex);
}

export function addColumnAfter(cell: HTMLTableCellElement): HTMLTableCellElement | undefined {
  const selection = getTableSelection(cell);
  if (selection === undefined || !selection.editable) return undefined;

  for (const row of Array.from(selection.table.rows)) {
    emptyCell(row.insertCell(selection.columnIndex + 1));
  }
  return cellAt(selection.table, selection.rowIndex, selection.columnIndex + 1);
}

export function deleteActiveColumn(cell: HTMLTableCellElement): HTMLTableCellElement | undefined {
  const selection = getTableSelection(cell);
  if (selection === undefined || !selection.editable || selection.columnCount <= tableSizeMinimum) {
    return undefined;
  }

  for (const row of Array.from(selection.table.rows)) {
    row.deleteCell(selection.columnIndex);
  }
  const targetColumnIndex = Math.min(selection.columnIndex, selection.columnCount - 2);
  return cellAt(selection.table, selection.rowIndex, targetColumnIndex);
}
