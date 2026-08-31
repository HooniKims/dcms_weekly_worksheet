import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DepartmentSnapshot, Entry, Week } from "../domain/models";
import { PrintPreviewDialog } from "./PrintPreviewDialog";

const department: DepartmentSnapshot = {
  id: "department-planning",
  name: "교무기획부",
  order: 0,
  active: true,
  omitWhenEmpty: false,
};

const week: Week = {
  id: "2026-08-31",
  dateLabel: "2026년 8월 31일",
  meetingTitle: "주간업무추진사항",
  createdBy: "migration",
  createdAt: "2026-08-28T00:00:00.000Z",
  departmentSnapshot: [department],
};

const entries: readonly Entry[] = [
  {
    departmentId: department.id,
    htmlContent: "<p>미리보기 내용</p>",
    plainText: "미리보기 내용",
    version: 1,
    updatedAt: "2026-08-28T00:00:00.000Z",
    updatedByRole: "migration",
  },
];

describe("PrintPreviewDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  });

  it("Given a preview opens, when the dialog mounts, then it enters the browser modal layer", () => {
    // Given
    const showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: showModal,
    });

    // When
    render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    // Then
    expect(showModal).toHaveBeenCalledOnce();
    expect(screen.getByRole("dialog", { name: "A4 인쇄 미리보기" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
  });

  it("Given a saved report, when preview opens, then it shows the selected week before printing", () => {
    // Given / When
    render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    // Then
    expect(screen.getByRole("dialog", { name: "A4 인쇄 미리보기" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /주간업무추진사항/ })).toBeInTheDocument();
    expect(screen.getByText("미리보기 내용")).toBeInTheDocument();
  });

  it("Given an open preview, when printing, then it invokes the print action", async () => {
    // Given
    const user = userEvent.setup();
    const onPrint = vi.fn();
    render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={vi.fn()}
        onPrint={onPrint}
      />,
    );

    // When
    await user.click(screen.getByRole("button", { name: "인쇄하기" }));

    // Then
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it("Given browser printing is unavailable, when printing is selected, then the preview remains open", async () => {
    // Given
    const user = userEvent.setup();
    vi.stubGlobal("print", undefined);
    render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={vi.fn()}
      />,
    );

    // When
    await user.click(screen.getByRole("button", { name: "인쇄하기" }));

    // Then
    expect(screen.getByRole("dialog", { name: "A4 인쇄 미리보기" })).toBeInTheDocument();
  });

  it("Given an open preview, when Escape is pressed, then it closes", async () => {
    // Given
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={onClose}
        onPrint={vi.fn()}
      />,
    );

    // When
    await user.keyboard("{Escape}");

    // Then
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Given a focused trigger, when preview unmounts, then focus returns to that trigger", () => {
    // Given
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const { unmount } = render(
      <PrintPreviewDialog
        week={week}
        departments={[department]}
        entries={entries}
        onClose={vi.fn()}
        onPrint={vi.fn()}
      />,
    );

    // When
    unmount();

    // Then
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
