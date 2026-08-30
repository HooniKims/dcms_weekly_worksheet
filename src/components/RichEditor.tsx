import { Link, ListBullets, ListNumbers, Table } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { sanitizeEditorHtml } from "../domain/content";

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

function addTable(): void {
  runCommand(
    "insertHTML",
    "<table><tbody><tr><td>내용</td><td>내용</td></tr><tr><td>내용</td><td>내용</td></tr></tbody></table><p><br></p>",
  );
}

export function RichEditor({ value, onChange }: RichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor !== null && editor.innerHTML !== value) replaceEditorContent(editor, value);
  }, [value]);

  return (
    <div className="editor-shell">
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
        <button type="button" onClick={addTable} aria-label="표 삽입">
          <Table size={19} />
        </button>
      </div>
      <div
        ref={editorRef}
        className="rich-editor"
        contentEditable
        role="textbox"
        tabIndex={0}
        aria-multiline="true"
        aria-label="업무 내용"
        data-placeholder="이번 주 추진사항을 입력하세요."
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        suppressContentEditableWarning
      />
    </div>
  );
}
