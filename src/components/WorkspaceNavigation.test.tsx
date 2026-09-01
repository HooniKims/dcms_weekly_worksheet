import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceSnapshot } from "../data/repository";
import type { Department, Week } from "../domain/models";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

const department: Department = {
  id: "department-01",
  name: "말씀 및 기도",
  order: 0,
  active: true,
  omitWhenEmpty: false,
};

const weeks: readonly Week[] = [
  {
    id: "2026-08-31",
    dateLabel: "2026년 8월 31일",
    meetingTitle: "주간업무추진사항",
    createdBy: "migration",
    createdAt: "2026-08-28T00:00:00.000Z",
    departmentSnapshot: [department],
  },
  {
    id: "2026-08-24",
    dateLabel: "2026년 8월 24일",
    meetingTitle: "주간업무추진사항",
    createdBy: "migration",
    createdAt: "2026-08-21T00:00:00.000Z",
    departmentSnapshot: [department],
  },
];

const snapshot: WorkspaceSnapshot = {
  weeks,
  archivedWeeks: [],
  departments: [department],
  entries: [],
};

describe("WorkspaceNavigation", () => {
  it("shows the current input date in one selector and loads a selected historical date", async () => {
    const user = userEvent.setup();
    const changeWeek = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkspaceNavigation
        snapshot={snapshot}
        departments={[department]}
        weekId="2026-08-31"
        departmentId={department.id}
        onWeekChange={changeWeek}
        onDepartmentChange={vi.fn()}
      />,
    );

    const selector = screen.getByRole("combobox", { name: "작성할 날짜" });
    expect(selector).toHaveDisplayValue("2026.08.31 (월) · 현재 입력");
    expect(screen.queryByRole("button", { name: /2026년 8월 24일/ })).not.toBeInTheDocument();

    await user.selectOptions(selector, "2026-08-24");
    expect(changeWeek).toHaveBeenCalledWith("2026-08-24");
  });
});
