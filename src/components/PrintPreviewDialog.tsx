import { Printer, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { DepartmentSnapshot, Entry, Week } from "../domain/models";
import { ReportView } from "./ReportView";

type PrintPreviewDialogProps = Readonly<{
  week: Week;
  departments: readonly DepartmentSnapshot[];
  entries: readonly Entry[];
  onClose: () => void;
  onPrint?: () => void;
}>;

function printCurrentWindow(): void {
  if (typeof window.print === "function") window.print();
}

export function PrintPreviewDialog({
  week,
  departments,
  entries,
  onClose,
  onPrint = printCurrentWindow,
}: PrintPreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    if (dialog !== null) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    document.body.classList.add("print-preview-active");
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("print-preview-active");
      document.removeEventListener("keydown", closeOnEscape);
      if (dialog?.open === true && typeof dialog.close === "function") dialog.close();
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="print-preview-backdrop"
      aria-label="A4 인쇄 미리보기"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <section className="print-preview-dialog">
        <header className="print-preview-controls print-preview-heading">
          <div>
            <p className="eyebrow">A4 PRINT PREVIEW</p>
            <h2>A4 인쇄 미리보기</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label="미리보기 닫기"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="print-preview-document">
          <ReportView week={week} departments={departments} entries={entries} />
        </div>
        <footer className="print-preview-controls print-preview-actions">
          <p>현재 저장된 내용이 인쇄됩니다.</p>
          <div>
            <button className="ghost-button" type="button" onClick={onClose}>
              닫기
            </button>
            <button className="primary-button" type="button" onClick={onPrint}>
              <Printer size={18} /> 인쇄하기
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  );
}
