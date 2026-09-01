import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { getRepository } from "./data";
import type { WorkspaceRepository, WorkspaceSnapshot } from "./data/repository";

vi.mock("./data", () => ({
  getRepository: vi.fn(),
  isLocalDemo: false,
}));

const workspaceSnapshot: WorkspaceSnapshot = {
  weeks: [
    {
      id: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      meetingTitle: "주간업무추진사항",
      createdBy: "migration",
      createdAt: "2026-08-28T00:00:00.000Z",
      departmentSnapshot: [
        {
          id: "department-01",
          name: "교무기획부",
          order: 0,
          active: true,
          omitWhenEmpty: false,
        },
      ],
    },
  ],
  archivedWeeks: [],
  departments: [
    {
      id: "department-01",
      name: "교무기획부",
      order: 0,
      active: true,
      omitWhenEmpty: false,
    },
  ],
  entries: [],
};

function repository(logout: () => Promise<void>): WorkspaceRepository {
  return {
    unlock: vi.fn().mockResolvedValue(undefined),
    logout,
    restoreSession: vi.fn().mockResolvedValue(false),
    signInAdmin: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(workspaceSnapshot),
    subscribeToWeek: vi.fn().mockReturnValue(() => undefined),
    saveEntry: vi.fn(),
    saveDepartments: vi.fn(),
    createWeek: vi.fn(),
    archiveWeek: vi.fn(),
    restoreWeek: vi.fn(),
    search: vi.fn(),
    rebuildSearchIndex: vi.fn(),
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.mocked(getRepository).mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("Given an unlocked workspace, when logout fails at the repository, then it still clears restoration and returns to the lock screen", async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockRejectedValue(new Error("network"));
    vi.mocked(getRepository).mockResolvedValue(repository(logout));

    render(<App />);
    await user.type(screen.getByLabelText("공용 비밀번호"), "site-test-password");
    await user.click(screen.getByRole("button", { name: "업무 화면 열기" }));
    await screen.findByRole("button", { name: "로그아웃" });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("weekly-work-session")).toBeNull();
    expect(screen.getByLabelText("공용 비밀번호")).toBeInTheDocument();
  });
});
