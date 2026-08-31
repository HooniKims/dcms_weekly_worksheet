import { Link, ListBullets, ListNumbers, Table } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { sanitizeEditorHtml } from "../domain/content";
import { TableEditActions, TableSizePicker } from "./RichTableControls";
import {
  addColumnAfter,
  addRowAfter,
  createTableHtml,
  deleteActiveColumn,
  deleteActiveRow,
  getTableSelection,
} from "./richTable";

type RichEditorProps = Readonly<{
  value: string;
  onChange: (html: string) => void;
}>;

function runCommand(command: string, value?: string): void {
  document.execCommand(command, false, value);
}

function replaceEditorContent(editor: HTMLDivElement, html: string): void {
  const parsed = new DOMParser().parseFromString(sanitizeEditorHtml(html), "text/html");
  const nodes = Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true));
  editor.replaceChildren(...nodes);
}

function addLink(): void {
  const url = window.prompt("연결할 웹 주소를 입력하세요.", "https://");
  if (url !== null && /^https?:\/\//i.test(url)) runCommand("createLink", url);
}

export function RichEditor({ value, onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range>(undefined);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const [tableRows, setTableRows] = useState(2);
  const [tableColumns, setTableColumns] = useState(2);
  const [activeCell, setActiveCell] = useState<HTMLTableCellElement>();
  const tableSelection = activeCell === undefined ? undefined : getTableSelection(activeCell);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.innerHTML !== value) {
      replaceEditorContent(editor, value);
      setActiveCell(undefined);
    }
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node) || shellRef.current?.contains(target) !== true) {
        setActiveCell(undefined);
        setTablePickerOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) return;
    const observer = new MutationObserver(() => {
      setActiveCell((cell) => (cell?.isConnected === false ? undefined : cell));
    });
    observer.observe(editor, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function rememberSelection(): void {
    const editor = editorRef.current;
    const selection = document.getSelection();
    if (editor === null || selection === null || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }

  function insertTable(): void {
    const editor = editorRef.current;
    if (editor === null) return;
    const selection = document.getSelection();
    const savedRange = savedRangeRef.current;
    if (selection !== null && savedRange !== undefined) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
    runCommand("insertHTML", `${createTableHtml(tableRows, tableColumns)}<p><br></p>`);
    setTablePickerOpen(false);
    onChange(editor.innerHTML);
  }

  function selectTableCell(target: EventTarget | null): void {
    const editor = editorRef.current;
    if (!(target instanceof Element) || editor === null) return;
    const cell = target.closest("td, th");
    setActiveCell(cell instanceof HTMLTableCellElement && editor.contains(cell) ? cell : undefined);
  }

  function updateTable(
    operation: (cell: HTMLTableCellElement) => HTMLTableCellElement | undefined,
  ): void {
    const editor = editorRef.current;
    if (editor === null || activeCell === undefined) return;
    const nextCell = operation(activeCell);
    if (nextCell === undefined) return;
    setActiveCell(nextCell);
    onChange(editor.innerHTML);
    const selection = document.getSelection();
    if (selection !== null) {
      const range = document.createRange();
      range.selectNodeContents(nextCell);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    }
  }

  return (
    <div className="editor-shell" ref={shellRef}>
      <div className="editor-toolbar" role="toolbar" aria-label="문서 서식">
        <button type="button" onClick={() => runCommand("bold")} aria-label="굵게">
          <strong>B</strong>
        </button>
        <button type="button" onClick={() => runCommand("italic")} aria-label="기울임">
          <em>I</em>
        </button>
        <button type="button" onClick={() => runCommand("underline")} aria-label="밑줄">
          <u>U</u>
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          onClick={() => runCommand("insertUnorderedList")}
          aria-label="글머리표"
        >
          <ListBullets size={19} />
        </button>
        <button
          type="button"
          onClick={() => runCommand("insertOrderedList")}
          aria-label="번호 목록"
        >
          <ListNumbers size={19} />
        </button>
        <button type="button" onClick={addLink} aria-label="링크">
          <Link size={19} />
        </button>
        <button
          type="button"
          onPointerDown={rememberSelection}
          onClick={() => setTablePickerOpen((open) => !open)}
          aria-label="표 삽입"
          aria-expanded={tablePickerOpen}
        >
          <Table size={19} />
        </button>
      </div>
      {tablePickerOpen && (
        <TableSizePicker
          rows={tableRows}
          columns={tableColumns}
          onRowsChange={setTableRows}
          onColumnsChange={setTableColumns}
          onInsert={insertTable}
          onClose={() => setTablePickerOpen(false)}
        />
      )}
      {tableSelection !== undefined && (
        <TableEditActions
          selection={tableSelection}
          onAddRow={() => updateTable(addRowAfter)}
          onDeleteRow={() => updateTable(deleteActiveRow)}
          onAddColumn={() => updateTable(addColumnAfter)}
          onDeleteColumn={() => updateTable(deleteActiveColumn)}
        />
      )}
      <div
        ref={editorRef}
        className="rich-editor"
        contentEditable
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label="업무 내용"
        data-placeholder="이번 주 추진사항을 입력하세요."
        onClick={(event) => selectTableCell(event.target)}
        onKeyUp={(event) => selectTableCell(event.target)}
        onSelect={rememberSelection}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        suppressContentEditableWarning
      />
    </div>
  );
}
