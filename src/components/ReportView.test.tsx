import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Department, Entry, Week } from "../domain/models";
import { ReportView } from "./ReportView";

const departments: readonly Department[] = [
  {
    id: "department-prayer",
    name: "말씀 및 기도",
    order: 0,
    active: true,
    omitWhenEmpty: true,
  },
  {
    id: "department-01",
    name: "교무기획부",
    order: 1,
    active: true,
    omitWhenEmpty: false,
  },
  {
    id: "department-02",
    name: "교육연구부",
    order: 2,
    active: true,
    omitWhenEmpty: false,
  },
];

const week: Week = {
  id: "2026-08-31",
  dateLabel: "2026년 8월 31일",
  meetingTitle: "주간업무추진사항",
  createdBy: "migration",
  createdAt: "2026-08-28T00:00:00.000Z",
  departmentSnapshot: Array.from(departments),
};

const entries: readonly Entry[] = [
  {
    departmentId: "department-01",
    htmlContent:
      "<p><b><u>강조된 업무</u></b></p><table><tbody><tr><td>표 내용</td></tr></tbody></table>",
    plainText: "강조된 업무\n표 내용",
    version: 1,
    updatedAt: "2026-08-28T00:00:00.000Z",
    updatedByRole: "migration",
  },
];

describe("ReportView", () => {
  it("reproduces the Google Sheets title, metadata, grid, and rich content structure", () => {
    render(<ReportView week={week} departments={departments} entries={entries} />);

    const report = screen.getByRole("table", {
      name: "2026년 8월 31일 주간업무추진사항",
    });
    expect(within(report).getByText("주간업무추진사항")).toBeInTheDocument();
    expect(within(report).getByText("회의종류 :: 교무회의")).toBeInTheDocument();
    expect(within(report).getByText("2026년 8월 31일 (월)")).toBeInTheDocument();

    const emphasized = within(report).getByText("강조된 업무");
    expect(emphasized.tagName).toBe("U");
    expect(emphasized.parentElement?.tagName).toBe("B");
    expect(within(report).getByText("표 내용").closest("table")).not.toBe(report);
    expect(within(report).getByText("* 없음")).toBeInTheDocument();
    expect(
      within(report).queryByRole("rowheader", { name: "말씀 및 기도" }),
    ).not.toBeInTheDocument();
    expect(within(report).queryByText("등록된 내용이 없습니다.")).not.toBeInTheDocument();
  });

  it("removes only trailing visual-empty blocks from department report content", () => {
    const entriesWithTrailingBlanks: readonly Entry[] = [
      {
        departmentId: "department-01",
        htmlContent: "<p><b><u>보이는 업무</u></b></p><p>&nbsp;</p><div><br></div><br>",
        plainText: "보이는 업무",
        version: 1,
        updatedAt: "2026-08-28T00:00:00.000Z",
        updatedByRole: "migration",
      },
    ];

    const { container } = render(
      <ReportView week={week} departments={departments} entries={entriesWithTrailingBlanks} />,
    );

    const content = container.querySelector(".report-content");
    expect(content?.children).toHaveLength(1);
    expect(within(content as HTMLElement).getByText("보이는 업무").tagName).toBe("U");
  });

  it("keeps an empty renamed department omitted through its semantic flag", () => {
    const renamedDepartments = departments.map((department) =>
      department.id === "department-prayer" ? { ...department, name: "주간 나눔" } : department,
    );
    render(
      <ReportView
        week={{ ...week, departmentSnapshot: renamedDepartments }}
        departments={renamedDepartments}
        entries={entries}
      />,
    );

    expect(screen.queryByRole("rowheader", { name: "주간 나눔" })).not.toBeInTheDocument();
  });
});
