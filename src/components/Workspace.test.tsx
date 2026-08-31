import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SaveResult, WorkspaceRepository, WorkspaceSnapshot } from "../data/repository";
import type { Week } from "../domain/models";
import type { WeekId } from "../domain/week";
import { Workspace } from "./Workspace";

const currentWeekId: WeekId = "2026-08-31";
const sameDepartmentWeekId: WeekId = "2026-08-24";
const fallbackDepartmentWeekId: WeekId = "2026-08-17";

const currentDepartment = {
  id: "department-current",
  name: "현재 부서",
  order: 0,
  active: true,
  omitWhenEmpty: false,
} as const;

const currentSecondDepartment = {
  id: "department-current-second",
  name: "현재 두 번째 부서",
  order: 1,
  active: true,
  omitWhenEmpty: false,
} as const;

const sameDepartment = {
  ...currentDepartment,
  name: "이전 주차 현재 부서",
} as const;

const fallbackDepartment = {
  id: "department-fallback",
  name: "대체 부서",
  order: 1,
  active: true,
  omitWhenEmpty: false,
} as const;

const fallbackFirstDepartment = {
  id: "department-fallback-first",
  name: "첫 번째 부서",
  order: 0,
  active: true,
  omitWhenEmpty: false,
} as const;

const weeks: readonly Week[] = [
  {
    id: currentWeekId,
    dateLabel: "2026년 8월 31일",
    meetingTitle: "주간업무추진사항",
    createdBy: "migration" as const,
    createdAt: "2026-08-28T00:00:00.000Z",
    departmentSnapshot: [currentDepartment, currentSecondDepartment],
  },
  {
    id: sameDepartmentWeekId,
    dateLabel: "2026년 8월 24일",
    meetingTitle: "주간업무추진사항",
    createdBy: "migration" as const,
    createdAt: "2026-08-21T00:00:00.000Z",
    departmentSnapshot: [sameDepartment],
  },
  {
    id: fallbackDepartmentWeekId,
    dateLabel: "2026년 8월 17일",
    meetingTitle: "주간업무추진사항",
    createdBy: "migration" as const,
    createdAt: "2026-08-14T00:00:00.000Z",
    departmentSnapshot: [fallbackFirstDepartment, fallbackDepartment],
  },
];

const initialData: WorkspaceSnapshot = {
  weeks,
  departments: [
    {
      id: "master-only",
      name: "현재 목록에만 있는 부서",
      order: 0,
      active: true,
      omitWhenEmpty: false,
    },
  ],
  entries: [
    {
      departmentId: currentDepartment.id,
      htmlContent: "<p>현재 주차 내용</p>",
      plainText: "현재 주차 내용",
      version: 1,
      updatedAt: "2026-08-28T00:00:00.000Z",
      updatedByRole: "migration",
    },
    {
      departmentId: currentSecondDepartment.id,
      htmlContent: "<p>현재 두 번째 부서 내용</p>",
      plainText: "현재 두 번째 부서 내용",
      version: 1,
      updatedAt: "2026-08-28T00:00:00.000Z",
      updatedByRole: "migration",
    },
  ],
};

function snapshotFor(weekId: WeekId): WorkspaceSnapshot {
  const week = weeks.find((item) => item.id === weekId);
  if (week === undefined) throw new Error("week-fixture-missing");
  return {
    weeks,
    departments: initialData.departments,
    entries: week.departmentSnapshot.map((department) => ({
      departmentId: department.id,
      htmlContent: `<p>${department.name} 내용</p>`,
      plainText: `${department.name} 내용`,
      version: week.id === sameDepartmentWeekId ? 9 : 1,
      updatedAt: "2026-08-28T00:00:00.000Z",
      updatedByRole: "migration",
    })),
  };
}

function repository(overrides: Partial<WorkspaceRepository> = {}): WorkspaceRepository {
  return {
    unlock: vi.fn(),
    logout: vi.fn(),
    restoreSession: vi.fn(),
    signInAdmin: vi.fn(),
    load: vi.fn((weekId?: WeekId) => Promise.resolve(snapshotFor(weekId ?? currentWeekId))),
    subscribeToWeek: vi.fn().mockReturnValue(() => undefined),
    saveEntry: vi.fn(),
    saveDepartments: vi.fn(),
    createWeek: vi.fn(),
    search: vi.fn(),
    rebuildSearchIndex: vi.fn(),
    ...overrides,
  };
}

function deferred<Value>() {
  let settle: ((value: Value | PromiseLike<Value>) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: Value): void {
      if (settle === undefined) throw new Error("deferred-resolver-missing");
      settle(value);
    },
  };
}

describe("Workspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("Given the workspace opens, when no tab was chosen, then it starts in the selected week snapshot editor", () => {
    render(
      <Workspace
        repository={repository()}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "업무 내용" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "현재 부서" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /주간업무추진사항/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "주간표" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A4 인쇄" })).not.toBeInTheDocument();
    expect(screen.queryByText("현재 목록에만 있는 부서")).not.toBeInTheDocument();
  });

  it("Given a contributor workspace, when administrator authentication succeeds, then report rendering and printing become available", async () => {
    const user = userEvent.setup();
    const signInAdmin = vi.fn().mockResolvedValue(undefined);
    render(
      <Workspace
        repository={repository({ signInAdmin })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));

    expect(signInAdmin).toHaveBeenCalledWith("admin-test-password");
    expect(await screen.findByRole("button", { name: "주간표" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A4 인쇄" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "주간표" }));
    expect(screen.getByRole("table", { name: /주간업무추진사항/ })).toBeInTheDocument();
  });

  it("Given administrator access from the editor, when A4 print is selected, then a preview appears before printing", async () => {
    // Given
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(
      <Workspace
        repository={repository({ signInAdmin: vi.fn().mockResolvedValue(undefined) })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));

    // When
    await user.click(screen.getByRole("button", { name: "A4 인쇄" }));

    // Then
    expect(screen.getByRole("dialog", { name: "A4 인쇄 미리보기" })).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "인쇄하기" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("Given administrator authentication fails, when the password is submitted, then report and print controls stay unavailable", async () => {
    const user = userEvent.setup();
    const signInAdmin = vi.fn().mockRejectedValue(new Error("invalid-password"));
    render(
      <Workspace
        repository={repository({ signInAdmin })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "wrong");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));

    expect(await screen.findByText("관리자 비밀번호를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "주간표" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "A4 인쇄" })).not.toBeInTheDocument();
  });

  it("Given the current department exists in the chosen week snapshot, when the date changes, then it retains that department id and reloads its draft", async () => {
    const user = userEvent.setup();
    render(
      <Workspace
        repository={repository()}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, sameDepartmentWeekId);

    expect(await screen.findByRole("heading", { name: "이전 주차 현재 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "이전 주차 현재 부서 내용",
    );
  });

  it("Given the current department is absent from the chosen week snapshot, when the date changes, then it selects that snapshot's first department", async () => {
    const user = userEvent.setup();
    render(
      <Workspace
        repository={repository()}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, fallbackDepartmentWeekId);

    expect(await screen.findByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "첫 번째 부서 내용",
    );
  });

  it("Given a save from the prior week is pending, when the contributor changes to the same department in another week, then the late save cannot replace the current draft, version, or save state", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<SaveResult>();
    const saveEntry = vi.fn<WorkspaceRepository["saveEntry"]>(() => pendingSave.promise);
    render(
      <Workspace
        repository={repository({ saveEntry })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    expect(saveEntry).toHaveBeenCalledTimes(1);

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, sameDepartmentWeekId);
    expect(await screen.findByRole("heading", { name: "이전 주차 현재 부서" })).toBeInTheDocument();

    await act(async () => {
      pendingSave.resolve({
        status: "saved",
        entry: {
          departmentId: currentDepartment.id,
          htmlContent: "<p>이전 선택의 저장 결과</p>",
          plainText: "이전 선택의 저장 결과",
          version: 2,
          updatedAt: "2026-08-28T00:01:00.000Z",
          updatedByRole: "contributor",
        },
      });
    });

    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "이전 주차 현재 부서 내용",
    );
    expect(screen.getByText("저장됨")).toHaveClass("idle");

    await user.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    expect(saveEntry.mock.calls.at(1)?.[0].expectedVersion).toBe(9);
  });

  it("Given two week loads are pending, when the newer request resolves before the older request, then the older response cannot revert the selected week", async () => {
    const user = userEvent.setup();
    const sameWeekLoad = deferred<WorkspaceSnapshot>();
    const fallbackWeekLoad = deferred<WorkspaceSnapshot>();
    const load = vi.fn<WorkspaceRepository["load"]>((weekId) => {
      if (weekId === sameDepartmentWeekId) return sameWeekLoad.promise;
      if (weekId === fallbackDepartmentWeekId) return fallbackWeekLoad.promise;
      return Promise.resolve(snapshotFor(currentWeekId));
    });
    render(
      <Workspace
        repository={repository({ load })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, sameDepartmentWeekId);
    await user.selectOptions(dateSelector, fallbackDepartmentWeekId);

    await act(async () => {
      fallbackWeekLoad.resolve(snapshotFor(fallbackDepartmentWeekId));
    });
    expect(await screen.findByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();

    await act(async () => {
      sameWeekLoad.resolve(snapshotFor(sameDepartmentWeekId));
    });

    expect(screen.getByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "첫 번째 부서 내용",
    );
  });

  it("Given a week load is pending, when the user selects another department, then the late week response cannot overwrite that manual selection", async () => {
    const user = userEvent.setup();
    const pendingLoad = deferred<WorkspaceSnapshot>();
    const load = vi.fn<WorkspaceRepository["load"]>((weekId) => {
      if (weekId === fallbackDepartmentWeekId) return pendingLoad.promise;
      return Promise.resolve(snapshotFor(weekId ?? currentWeekId));
    });
    render(
      <Workspace
        repository={repository({ load })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, fallbackDepartmentWeekId);
    await user.click(screen.getByRole("button", { name: "현재 두 번째 부서" }));

    expect(screen.getByRole("heading", { name: "현재 두 번째 부서" })).toBeInTheDocument();
    await act(async () => {
      pendingLoad.resolve(snapshotFor(fallbackDepartmentWeekId));
    });

    expect(screen.getByRole("heading", { name: "현재 두 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "현재 두 번째 부서 내용",
    );
  });

  it("Given an archive search result, when the contributor selects append in the reuse dialog, then formatted source content is added without leaving the current editor", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([
      {
        weekId: fallbackDepartmentWeekId,
        dateLabel: "2026년 8월 17일",
        departmentId: fallbackDepartment.id,
        departmentName: fallbackDepartment.name,
        excerpt: "대체 부서 내용",
      },
    ]);
    render(
      <Workspace
        repository={repository({ search })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "전체 주차 검색" }), "대체");
    await user.click(await screen.findByRole("option", { name: /2026년 8월 17일.*대체 부서/ }));

    expect(await screen.findByRole("heading", { name: "과거 내용 재사용" })).toBeInTheDocument();
    expect(screen.getByText("원본: 2026년 8월 17일 · 대체 부서")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent("현재 주차 내용");

    expect(screen.getByRole("option", { name: "현재 부서 (추천)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "현재 주차에 추가" }));

    expect(screen.queryByRole("heading", { name: "과거 내용 재사용" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "현재 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "현재 주차 내용대체 부서 내용",
    );
    expect(screen.getByText("저장 전 변경사항")).toBeInTheDocument();
  });

  it("Given an archive result contains rich text, when the contributor chooses replace, then sanitized source content replaces the current draft", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([
      {
        weekId: fallbackDepartmentWeekId,
        dateLabel: "2026년 8월 17일",
        departmentId: fallbackDepartment.id,
        departmentName: fallbackDepartment.name,
        excerpt: "강조된 재사용 내용",
      },
    ]);
    const sourceSnapshot = snapshotFor(fallbackDepartmentWeekId);
    const load = vi.fn().mockResolvedValue({
      ...sourceSnapshot,
      entries: sourceSnapshot.entries.map((entry) =>
        entry.departmentId === fallbackDepartment.id
          ? {
              ...entry,
              htmlContent: "<p><strong>강조된 재사용 내용</strong><script>bad()</script></p>",
            }
          : entry,
      ),
    });
    render(
      <Workspace
        repository={repository({ load, search })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "전체 주차 검색" }), "강조");
    await user.click(await screen.findByRole("option", { name: /2026년 8월 17일.*대체 부서/ }));
    await user.click(await screen.findByRole("button", { name: "현재 주차 내용 교체" }));

    const editor = screen.getByRole("textbox", { name: "업무 내용" });
    expect(editor).toHaveTextContent("강조된 재사용 내용");
    expect(editor).not.toHaveTextContent("현재 주차 내용");
    expect(editor.querySelector("strong")).toHaveTextContent("강조된 재사용 내용");
    expect(editor.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText("저장 전 변경사항")).toBeInTheDocument();
  });

  it("Given an archive search result, when the contributor chooses navigate, then that result's week and department open in the editor", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([
      {
        weekId: fallbackDepartmentWeekId,
        dateLabel: "2026년 8월 17일",
        departmentId: fallbackDepartment.id,
        departmentName: fallbackDepartment.name,
        excerpt: "대체 부서 내용",
      },
    ]);
    render(
      <Workspace
        repository={repository({ search })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("combobox", { name: "전체 주차 검색" }), "대체");
    await user.click(await screen.findByRole("option", { name: /2026년 8월 17일.*대체 부서/ }));
    await user.click(await screen.findByRole("button", { name: "원본 주차 보기" }));

    expect(await screen.findByRole("heading", { name: "대체 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent("대체 부서 내용");
  });

  it("Given departments changed since the source week, when the contributor chooses a destination, then the source is brought into that department in the current input week", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([
      {
        weekId: fallbackDepartmentWeekId,
        dateLabel: "2026년 8월 17일",
        departmentId: fallbackDepartment.id,
        departmentName: fallbackDepartment.name,
        excerpt: "대체 부서 내용",
      },
    ]);
    render(
      <Workspace
        repository={repository({ search })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, sameDepartmentWeekId);
    await user.type(screen.getByRole("combobox", { name: "전체 주차 검색" }), "대체");
    await user.click(await screen.findByRole("option", { name: /2026년 8월 17일.*대체 부서/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: /가져올 부서/ }),
      currentSecondDepartment.id,
    );
    await user.click(screen.getByRole("button", { name: "현재 주차에 추가" }));

    expect(await screen.findByRole("heading", { name: "현재 두 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "현재 두 번째 부서 내용대체 부서 내용",
    );
    expect(screen.getByText("저장 전 변경사항")).toBeInTheDocument();
  });

  it("Given an administrator saves departments for the selected week, when the snapshot response removes the selected department, then the workspace refreshes that week and falls back to its first active department", async () => {
    const user = userEvent.setup();
    const savedDepartments = [currentDepartment];
    const savedSnapshot: WorkspaceSnapshot = {
      ...initialData,
      weeks: weeks.map((week) =>
        week.id === currentWeekId ? { ...week, departmentSnapshot: savedDepartments } : week,
      ),
      entries: initialData.entries.filter((entry) => entry.departmentId === currentDepartment.id),
    };
    const saveDepartments = vi
      .fn<WorkspaceRepository["saveDepartments"]>()
      .mockResolvedValue(savedSnapshot);
    render(
      <Workspace
        repository={repository({ saveDepartments })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "현재 두 번째 부서" }));
    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await screen.findByText("선택한 주차: 2026년 8월 31일");
    await user.click(screen.getByRole("button", { name: "현재 두 번째 부서 삭제" }));
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));

    expect(saveDepartments).toHaveBeenCalledWith(currentWeekId, [
      { ...currentDepartment, order: 0, active: true },
    ]);
    expect(await screen.findByRole("heading", { name: "현재 부서" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "현재 두 번째 부서" })).not.toBeInTheDocument();
  });

  it("Given an administrator saves a selected department that remains in the returned snapshot, when the server changes its name, order, and entry, then the workspace retains its id and reloads that returned entry draft", async () => {
    const user = userEvent.setup();
    const returnedSecondDepartment = {
      ...currentSecondDepartment,
      name: "반환된 두 번째 부서",
      order: 1,
    } as const;
    const returnedFirstDepartment = { ...currentDepartment, order: 0 } as const;
    const returnedSnapshot: WorkspaceSnapshot = {
      ...initialData,
      weeks: weeks.map((week) =>
        week.id === currentWeekId
          ? {
              ...week,
              departmentSnapshot: [returnedFirstDepartment, returnedSecondDepartment],
            }
          : week,
      ),
      entries: [
        {
          departmentId: currentSecondDepartment.id,
          htmlContent: "<p>서버가 반환한 최신 내용</p>",
          plainText: "서버가 반환한 최신 내용",
          version: 4,
          updatedAt: "2026-08-30T00:00:00.000Z",
          updatedByRole: "admin",
        },
      ],
    };
    const saveDepartments = vi
      .fn<WorkspaceRepository["saveDepartments"]>()
      .mockResolvedValue(returnedSnapshot);
    render(
      <Workspace
        repository={repository({ saveDepartments })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "현재 두 번째 부서" }));
    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.clear(screen.getByLabelText("부서 이름 2"));
    await user.type(screen.getByLabelText("부서 이름 2"), "클라이언트 저장 이름");
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));

    expect(saveDepartments).toHaveBeenCalledWith(currentWeekId, [
      { ...currentDepartment, order: 0, active: true },
      { ...currentSecondDepartment, name: "클라이언트 저장 이름", order: 1, active: true },
    ]);
    expect(await screen.findByRole("heading", { name: "반환된 두 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "서버가 반환한 최신 내용",
    );
  });

  it("Given an administrator department save is pending, when the contributor changes week, then the late save response cannot replace the newer week or department selection", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<WorkspaceSnapshot>();
    const saveDepartments = vi.fn<WorkspaceRepository["saveDepartments"]>(
      () => pendingSave.promise,
    );
    render(
      <Workspace
        repository={repository({ saveDepartments })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));
    expect(saveDepartments).toHaveBeenCalledTimes(1);

    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, fallbackDepartmentWeekId);
    expect(await screen.findByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();

    await act(async () => {
      pendingSave.resolve({
        ...initialData,
        weeks: weeks.map((week) =>
          week.id === currentWeekId
            ? { ...week, departmentSnapshot: [currentSecondDepartment] }
            : week,
        ),
      });
    });

    expect(screen.getByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();
  });

  it("Given a manual week creation is pending, when the administrator closes the dialog and the contributor moves to another week and department, then the late created week cannot replace that newer selection or draft", async () => {
    const user = userEvent.setup();
    const pendingCreate = deferred<Week>();
    const createWeek = vi.fn<WorkspaceRepository["createWeek"]>(() => pendingCreate.promise);
    render(
      <Workspace
        repository={repository({ createWeek })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.type(screen.getByLabelText("새 주차 기준일"), "2026-09-07");
    await user.click(screen.getByRole("button", { name: "주차 생성하기" }));
    expect(createWeek).toHaveBeenCalledWith("2026-09-07");

    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: "현재 두 번째 부서" }));
    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    await user.selectOptions(dateSelector, fallbackDepartmentWeekId);
    expect(await screen.findByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();

    await act(async () => {
      pendingCreate.resolve({
        id: "2026-09-07",
        dateLabel: "2026년 9월 7일",
        meetingTitle: "주간업무추진사항",
        createdBy: "admin",
        createdAt: "2026-08-30T00:00:00.000Z",
        departmentSnapshot: [currentDepartment],
      });
    });

    expect(screen.getByRole("heading", { name: "첫 번째 부서" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "업무 내용" })).toHaveTextContent(
      "첫 번째 부서 내용",
    );
  });

  it("Given manual week creation resolves without a newer workspace selection, when the administrator creates a week, then its returned week becomes the active editor", async () => {
    const user = userEvent.setup();
    const createdDepartment = {
      id: "department-created",
      name: "새 주차 부서",
      order: 0,
      active: true,
      omitWhenEmpty: false,
    } as const;
    const createdWeek: Week = {
      id: "2026-09-07",
      dateLabel: "2026년 9월 7일",
      meetingTitle: "주간업무추진사항",
      createdBy: "admin",
      createdAt: "2026-08-30T00:00:00.000Z",
      departmentSnapshot: [createdDepartment],
    };
    render(
      <Workspace
        repository={repository({ createWeek: vi.fn().mockResolvedValue(createdWeek) })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.type(screen.getByLabelText("새 주차 기준일"), "2026-09-07");
    await user.click(screen.getByRole("button", { name: "주차 생성하기" }));

    expect(await screen.findByRole("heading", { name: "새 주차 부서" })).toBeInTheDocument();
    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    expect(dateSelector).toHaveValue("2026-09-07");
  });

  it("Given a manual week creation is pending, when the administrator only closes its dialog, then the late result cannot navigate away from the current editor", async () => {
    const user = userEvent.setup();
    const pendingCreate = deferred<Week>();
    const createWeek = vi.fn<WorkspaceRepository["createWeek"]>(() => pendingCreate.promise);
    render(
      <Workspace
        repository={repository({ createWeek })}
        initialData={initialData}
        demo={false}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "관리자" }));
    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));
    await user.type(screen.getByLabelText("새 주차 기준일"), "2026-09-07");
    await user.click(screen.getByRole("button", { name: "주차 생성하기" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));

    await act(async () => {
      pendingCreate.resolve({
        id: "2026-09-07",
        dateLabel: "2026년 9월 7일",
        meetingTitle: "주간업무추진사항",
        createdBy: "admin",
        createdAt: "2026-08-30T00:00:00.000Z",
        departmentSnapshot: [currentDepartment],
      });
    });

    expect(screen.getByRole("heading", { name: "현재 부서" })).toBeInTheDocument();
    const dateSelector = screen.getAllByRole("combobox", { name: "작성할 날짜" }).at(0);
    if (dateSelector === undefined) throw new Error("date-selector-missing");
    expect(dateSelector).toHaveValue(currentWeekId);
  });
});
