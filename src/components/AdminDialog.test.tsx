import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DepartmentSnapshot, Week } from "../domain/models";
import { AdminDialog } from "./AdminDialog";

const departments: readonly DepartmentSnapshot[] = [
  {
    id: "department-planning",
    name: "교무기획부",
    order: 0,
    active: true,
    omitWhenEmpty: false,
  },
  {
    id: "department-safety",
    name: "생활안전부",
    order: 1,
    active: true,
    omitWhenEmpty: false,
  },
];
const archivedWeek: Week = {
  id: "2026-08-24",
  dateLabel: "2026년 8월 24일",
  meetingTitle: "주간업무추진사항",
  createdBy: "admin",
  createdAt: "2026-08-24T00:00:00.000Z",
  archivedAt: "2026-09-01T00:00:00.000Z",
  departmentSnapshot: [...departments],
};
const activeWeeks: readonly Week[] = [
  {
    id: "2026-08-31",
    dateLabel: "2026년 8월 31일 (월)",
    meetingTitle: "주간업무추진사항",
    createdBy: "admin",
    createdAt: "2026-08-31T00:00:00.000Z",
    archivedAt: null,
    departmentSnapshot: [...departments],
  },
  {
    id: "2026-08-17",
    dateLabel: "2026년 8월 17일 (월)",
    meetingTitle: "주간업무추진사항",
    createdBy: "admin",
    createdAt: "2026-08-17T00:00:00.000Z",
    archivedAt: null,
    departmentSnapshot: [...departments],
  },
];

type DialogProps = React.ComponentProps<typeof AdminDialog>;

function dialog(overrides: Partial<DialogProps> = {}) {
  const props: DialogProps = {
    demo: false,
    onClose: vi.fn(),
    onSignIn: vi.fn().mockResolvedValue(undefined),
    onCreateWeek: vi.fn().mockResolvedValue(undefined),
    onArchiveWeek: vi.fn().mockResolvedValue(undefined),
    onRestoreWeek: vi.fn().mockResolvedValue(undefined),
    onSaveDepartments: vi.fn().mockResolvedValue(undefined),
    onRebuildSearchIndex: vi.fn().mockResolvedValue(undefined),
    selectedWeekLabel: "2026년 8월 31일 (월)",
    selectedWeekId: "2026-08-31",
    activeWeeks,
    archivedWeeks: [archivedWeek],
    departments,
    ...overrides,
  };
  const rendered = render(<AdminDialog {...props} />);
  return { props, ...rendered };
}

async function authenticate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
  await user.click(screen.getByRole("button", { name: "관리자 확인" }));
  await screen.findByText("관리자 권한이 확인되었습니다.");
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

describe("AdminDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("checks administrator access with a password only", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(undefined);
    dialog({ onSignIn: signIn });

    expect(screen.queryByLabelText("이메일")).not.toBeInTheDocument();
    await authenticate(user);

    expect(signIn).toHaveBeenCalledWith("admin-test-password");
    expect(screen.getByText("선택한 주차: 2026년 8월 31일 (월)")).toBeInTheDocument();
    expect(screen.queryByText(/자동으로 생성/)).not.toBeInTheDocument();
  });

  it("disables administrator sign-in while a password verification is pending", async () => {
    const user = userEvent.setup();
    const pendingSignIn = deferred<void>();
    const onSignIn = vi.fn(() => pendingSignIn.promise);
    dialog({ onSignIn });

    await user.type(screen.getByLabelText("관리자 비밀번호"), "admin-test-password");
    await user.click(screen.getByRole("button", { name: "관리자 확인" }));

    expect(screen.getByRole("button", { name: "관리자 확인 중…" })).toBeDisabled();
    expect(onSignIn).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingSignIn.resolve(undefined);
    });
    expect(await screen.findByText("관리자 권한이 확인되었습니다.")).toBeInTheDocument();
  });

  it("keeps a generated department id through rename and reorder before saving its exact normalized payload", async () => {
    const user = userEvent.setup();
    const onSaveDepartments = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "added-row-9") });
    dialog({ onSaveDepartments });
    await authenticate(user);

    await user.clear(screen.getByLabelText("부서 이름 1"));
    await user.type(screen.getByLabelText("부서 이름 1"), "교무운영부");
    await user.click(screen.getByRole("button", { name: "부서 추가" }));
    await user.type(screen.getByLabelText("부서 이름 3"), "행정실");
    await user.click(screen.getByRole("button", { name: "위로 이동 행정실" }));
    await user.click(screen.getByRole("button", { name: "생활안전부 삭제" }));
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));

    expect(
      screen
        .getAllByRole("textbox", { name: /부서 이름/ })
        .map((input) => input.getAttribute("value")),
    ).toEqual(["교무운영부", "행정실"]);
    expect(onSaveDepartments).toHaveBeenCalledWith([
      {
        id: "department-planning",
        name: "교무운영부",
        order: 0,
        active: true,
        omitWhenEmpty: false,
      },
      {
        id: "department-added-row-9",
        name: "행정실",
        order: 1,
        active: true,
        omitWhenEmpty: false,
      },
    ]);
  });

  it("locks every department mutation control while a save is pending and keeps the queued edit after success", async () => {
    const user = userEvent.setup();
    const pendingSave = deferred<void>();
    const onSaveDepartments = vi.fn(() => pendingSave.promise);
    dialog({ onSaveDepartments });
    await authenticate(user);

    await user.clear(screen.getByLabelText("부서 이름 1"));
    await user.type(screen.getByLabelText("부서 이름 1"), "저장 대기 중 부서");
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));

    expect(screen.getByLabelText("부서 이름 1")).toBeDisabled();
    expect(screen.getByLabelText("부서 이름 2")).toBeDisabled();
    expect(screen.getByRole("button", { name: "부서 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "아래로 이동 저장 대기 중 부서" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "생활안전부 삭제" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "부서 목록 저장 중…" })).toBeDisabled();

    await act(async () => {
      pendingSave.resolve(undefined);
    });
    expect(await screen.findByText("부서 목록을 저장했습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("부서 이름 1")).toHaveValue("저장 대기 중 부서");
    expect(screen.getByLabelText("부서 이름 1")).toBeEnabled();
  });

  it("blocks blank, normalized-duplicate, and empty department lists before saving", async () => {
    const user = userEvent.setup();
    const onSaveDepartments = vi.fn().mockResolvedValue(undefined);
    dialog({ onSaveDepartments });
    await authenticate(user);

    await user.clear(screen.getByLabelText("부서 이름 1"));
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));
    expect(screen.getByText("부서 이름을 입력해 주세요.")).toBeInTheDocument();
    expect(onSaveDepartments).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("부서 이름 1"), "생활 안전부");
    await user.clear(screen.getByLabelText("부서 이름 2"));
    await user.type(screen.getByLabelText("부서 이름 2"), "생활안전부");
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));
    expect(screen.getByText("같은 부서 이름은 한 번만 사용할 수 있습니다.")).toBeInTheDocument();
    expect(onSaveDepartments).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "생활 안전부 삭제" }));
    await user.click(screen.getByRole("button", { name: "생활안전부 삭제" }));
    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));
    expect(screen.getByText("최소 한 개의 부서가 필요합니다.")).toBeInTheDocument();
    expect(onSaveDepartments).not.toHaveBeenCalled();
  });

  it("creates a week only from the explicit date form", async () => {
    const user = userEvent.setup();
    const onCreateWeek = vi.fn().mockResolvedValue(undefined);
    dialog({ onCreateWeek });
    await authenticate(user);

    await user.type(screen.getByLabelText("새 주차 기준일"), "2026-09-07");
    await user.click(screen.getByRole("button", { name: "주차 생성하기" }));

    expect(onCreateWeek).toHaveBeenCalledWith("2026-09-07");
    expect(await screen.findByText("2026-09-07 주차를 준비했습니다.")).toBeInTheDocument();
  });

  it("rebuilds the search index only after the administrator confirms the repair action", async () => {
    const user = userEvent.setup();
    const onRebuildSearchIndex = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    dialog({ onRebuildSearchIndex });
    await authenticate(user);

    await user.click(screen.getByRole("button", { name: "검색 색인 다시 만들기" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onRebuildSearchIndex).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "검색 색인 다시 만들기" }));
    expect(onRebuildSearchIndex).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("검색 색인을 다시 만들었습니다.")).toBeInTheDocument();
  });

  it("reports asynchronous department save failures without closing the dialog", async () => {
    const user = userEvent.setup();
    dialog({ onSaveDepartments: vi.fn().mockRejectedValue(new Error("offline")) });
    await authenticate(user);

    await user.click(screen.getByRole("button", { name: "부서 목록 저장" }));

    expect(
      await screen.findByText("부서 목록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "관리자 도구" })).toBeInTheDocument();
  });

  it("Given more than one active week, when the administrator confirms archive, then the selected week moves to trash", async () => {
    // Given
    const user = userEvent.setup();
    const onArchiveWeek = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    dialog({ onArchiveWeek });
    await authenticate(user);

    // When
    await user.click(
      screen.getByRole("button", { name: "2026년 8월 31일 (월)을 휴지통으로 이동" }),
    );

    // Then
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onArchiveWeek).toHaveBeenCalledWith("2026-08-31");
    expect(
      await screen.findByText("2026년 8월 31일 (월)을 휴지통으로 이동했습니다."),
    ).toBeInTheDocument();
  });

  it("Given several active weeks, when the administrator chooses another trash target, then every archive surface uses that week", async () => {
    // Given
    const user = userEvent.setup();
    const onArchiveWeek = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    dialog({ onArchiveWeek, activeWeeks });
    await authenticate(user);

    // When
    await user.selectOptions(screen.getByLabelText("휴지통으로 이동할 주차"), "2026-08-17");

    // Then
    expect(screen.getByText("현재 삭제 대상: 2026년 8월 17일 (월)")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "2026년 8월 17일 (월)을 휴지통으로 이동" }),
    );
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("2026년 8월 17일 (월)"));
    expect(onArchiveWeek).toHaveBeenCalledWith("2026-08-17");
  });

  it("disables archive and restore together while a lifecycle request is pending", async () => {
    const user = userEvent.setup();
    const pendingArchive = deferred<void>();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    dialog({ onArchiveWeek: vi.fn(() => pendingArchive.promise) });
    await authenticate(user);

    await user.click(
      screen.getByRole("button", { name: "2026년 8월 31일 (월)을 휴지통으로 이동" }),
    );

    expect(screen.getByRole("button", { name: "이동 중…" })).toBeDisabled();
    expect(screen.getByLabelText("휴지통으로 이동할 주차")).toBeDisabled();
    expect(screen.getByRole("button", { name: "2026년 8월 24일 복원" })).toBeDisabled();
    await act(async () => pendingArchive.resolve(undefined));
  });

  it("Given the chosen target disappears, when active weeks refresh, then the newest remaining week becomes the target", async () => {
    // Given
    const user = userEvent.setup();
    const view = dialog({ activeWeeks });
    await authenticate(user);
    await user.selectOptions(screen.getByLabelText("휴지통으로 이동할 주차"), "2026-08-17");

    // When
    view.rerender(<AdminDialog {...view.props} activeWeeks={activeWeeks.slice(0, 1)} />);

    // Then
    expect(await screen.findByText("현재 삭제 대상: 2026년 8월 31일 (월)")).toBeInTheDocument();
    expect(screen.getByLabelText("휴지통으로 이동할 주차")).toHaveValue("2026-08-31");
  });

  it("Given only one active week, when viewing week management, then archive remains disabled", async () => {
    // Given
    const user = userEvent.setup();
    dialog({ activeWeeks: activeWeeks.slice(0, 1) });

    // When
    await authenticate(user);

    // Then
    expect(
      screen.getByRole("button", { name: "2026년 8월 31일 (월)을 휴지통으로 이동" }),
    ).toBeDisabled();
  });

  it("Given a week in trash, when the administrator restores it, then the archived week id is submitted", async () => {
    // Given
    const user = userEvent.setup();
    const onRestoreWeek = vi.fn().mockResolvedValue(undefined);
    dialog({ onRestoreWeek });
    await authenticate(user);

    // When
    await user.click(screen.getByRole("button", { name: "2026년 8월 24일 복원" }));

    // Then
    expect(onRestoreWeek).toHaveBeenCalledWith("2026-08-24");
    expect(await screen.findByText("주차를 복원했습니다.")).toBeInTheDocument();
  });
});
