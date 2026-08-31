import { ArrowLineDown, ArrowLineRight, Minus, Plus } from "@phosphor-icons/react";
import type { TableSelection } from "./richTable";

type TableSizePickerProps = Readonly<{
  rows: number;
  columns: number;
  onRowsChange: (rows: number) => void;
  onColumnsChange: (columns: number) => void;
  onInsert: () => void;
  onClose: () => void;
}>;

export function TableSizePicker({
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  onInsert,
  onClose,
}: TableSizePickerProps) {
  return (
    <div className="table-size-popover" role="dialog" aria-label="표 크기 선택">
      <div className="table-size-heading">
        <strong>표 크기</strong>
        <output aria-live="polite">
          {rows}행 × {columns}열
        </output>
      </div>
      <div className="table-size-controls">
        <span>행</span>
        <button
          type="button"
          aria-label="행 줄이기"
          disabled={rows <= 1}
          onClick={() => onRowsChange(rows - 1)}
        >
          <Minus size={16} />
        </button>
        <strong>{rows}</strong>
        <button
          type="button"
          aria-label="행 추가"
          disabled={rows >= 10}
          onClick={() => onRowsChange(rows + 1)}
        >
          <Plus size={16} />
        </button>
        <span>열</span>
        <button
          type="button"
          aria-label="열 줄이기"
          disabled={columns <= 1}
          onClick={() => onColumnsChange(columns - 1)}
        >
          <Minus size={16} />
        </button>
        <strong>{columns}</strong>
        <button
          type="button"
          aria-label="열 추가"
          disabled={columns >= 10}
          onClick={() => onColumnsChange(columns + 1)}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="table-size-actions">
        <button className="compact" type="button" onClick={onClose}>
          취소
        </button>
        <button className="primary-button compact" type="button" onClick={onInsert}>
          선택한 크기로 표 삽입
        </button>
      </div>
    </div>
  );
}

type TableEditActionsProps = Readonly<{
  selection: TableSelection;
  onAddRow: () => void;
  onDeleteRow: () => void;
  onAddColumn: () => void;
  onDeleteColumn: () => void;
}>;

export function TableEditActions({
  selection,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
}: TableEditActionsProps) {
  const editable = selection.editable;
  return (
    <div className="table-edit-actions" role="group" aria-label="선택한 표 편집">
      <button type="button" disabled={!editable} onClick={onAddRow}>
        <ArrowLineDown size={16} /> 아래에 행 추가
      </button>
      <button type="button" disabled={!editable || selection.rowCount <= 1} onClick={onDeleteRow}>
        <Minus size={16} /> 현재 행 삭제
      </button>
      <button type="button" disabled={!editable} onClick={onAddColumn}>
        <ArrowLineRight size={16} /> 오른쪽에 열 추가
      </button>
      <button
        type="button"
        disabled={!editable || selection.columnCount <= 1}
        onClick={onDeleteColumn}
      >
        <Minus size={16} /> 현재 열 삭제
      </button>
      {!editable && <span>병합된 표는 구조를 변경할 수 없습니다.</span>}
    </div>
  );
}
