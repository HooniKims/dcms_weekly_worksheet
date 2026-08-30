import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult } from "../domain/models";
import { WorkspaceSearch } from "./WorkspaceSearch";

const result: SearchResult = {
  weekId: "2026-08-24",
  dateLabel: "2026년 8월 24일",
  departmentId: "department-03",
  departmentName: "교무기획부",
  excerpt: "학생 안전 점검 계획",
};

const secondResult: SearchResult = {
  ...result,
  departmentId: "department-05",
  departmentName: "생활안전부",
  excerpt: "생활 안전 점검 계획",
};

function deferred<Value>() {
  let resolve: ((value: Value | PromiseLike<Value>) => void) | undefined;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return {
    promise,
    resolve(value: Value): void {
      if (resolve === undefined) throw new Error("missing-deferred-resolver");
      resolve(value);
    },
  };
}

describe("WorkspaceSearch", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("Given a one-character query, when it is entered, then it does not search", async () => {
    const user = userEvent.setup();
    const search = vi.fn().mockResolvedValue([]);
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    await user.type(screen.getByRole("combobox", { name: "전체 주차 검색" }), "안");

    expect(search).not.toHaveBeenCalled();
    expect(screen.getByText("두 글자 이상 입력하면 모든 주차에서 찾습니다.")).toBeInTheDocument();
  });

  it("Given an eligible query, when 250 milliseconds elapse, then it shows matching result details and selects it", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([result]);
    const onResultSelect = vi.fn();
    render(<WorkspaceSearch search={search} onResultSelect={onResultSelect} />);

    fireEvent.change(screen.getByRole("combobox", { name: "전체 주차 검색" }), {
      target: { value: "안전" },
    });
    expect(search).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(search).toHaveBeenCalledWith("안전");
    expect(screen.getByRole("option", { name: /2026년 8월 24일.*교무기획부/ })).toBeInTheDocument();
    expect(screen.getByText("학생 안전 점검 계획")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /2026년 8월 24일.*교무기획부/ }));
    expect(onResultSelect).toHaveBeenCalledWith(result);
    expect(screen.getByRole("combobox", { name: "전체 주차 검색" })).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Given visible search results, when ArrowDown and ArrowUp are pressed, then the combobox exposes and clamps the active option", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([result, secondResult]);
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "안전" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    const listbox = screen.getByRole("listbox");
    const options = screen.getAllByRole("option");
    const firstOption = options[0];
    const secondOption = options[1];
    if (firstOption === undefined || secondOption === undefined) {
      throw new Error("search-options-missing");
    }
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-activedescendant", firstOption.id);
    expect(firstOption).toHaveAttribute("aria-selected", "true");
    expect(secondOption).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", secondOption.id);
    expect(secondOption).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", secondOption.id);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveAttribute("aria-activedescendant", firstOption.id);
  });

  it("Given visible results, when Enter or Escape is pressed, then the active result selects or the combobox resets", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([result]);
    const onResultSelect = vi.fn();
    render(<WorkspaceSearch search={search} onResultSelect={onResultSelect} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "안전" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onResultSelect).toHaveBeenCalledWith(result);
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "안전" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("Given an active later result, when a new result set arrives, then the active descendant resets inside the new list", async () => {
    vi.useFakeTimers();
    const search = vi.fn((query: string) =>
      Promise.resolve(query === "안전" ? [result, secondResult] : [result]),
    );
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "안전" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    fireEvent.change(input, { target: { value: "회의" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    const onlyOption = screen.getByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", onlyOption.id);
    expect(onlyOption).toHaveAttribute("aria-selected", "true");
  });

  it("Given visible results, when the query changes to another valid value, then the old list is immediately unavailable during debounce", async () => {
    vi.useFakeTimers();
    const search = vi.fn((query: string) =>
      Promise.resolve(query === "교무" ? [result] : [secondResult]),
    );
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "교무" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole("option", { name: /교무기획부/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "안전" } });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /교무기획부/ })).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-activedescendant");
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("Given a prior query request is in flight, when the query changes, then the prior response cannot reopen its results", async () => {
    vi.useFakeTimers();
    const prior = deferred<readonly SearchResult[]>();
    const search = vi.fn((query: string) =>
      query === "교무" ? prior.promise : Promise.resolve([secondResult]),
    );
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "교무" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole("status")).toHaveTextContent("검색 중입니다.");

    fireEvent.change(input, { target: { value: "안전" } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-activedescendant");

    await act(async () => {
      prior.resolve([result]);
    });
    expect(screen.queryByRole("option", { name: /교무기획부/ })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole("option", { name: /생활안전부/ })).toBeInTheDocument();
  });

  it("Given an eligible query, when its request is pending, then it shows loading and distinguishes empty and failed responses", async () => {
    vi.useFakeTimers();
    const pending = deferred<readonly SearchResult[]>();
    const search = vi.fn(() => pending.promise);
    const { rerender } = render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "안전" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole("status")).toHaveTextContent("검색 중입니다.");

    await act(async () => {
      pending.resolve([]);
    });
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();

    const rejected = vi.fn().mockRejectedValue(new Error("network"));
    rerender(<WorkspaceSearch search={rejected} onResultSelect={vi.fn()} />);
    fireEvent.change(input, { target: { value: "회의" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("검색 결과를 불러오지 못했습니다.");
  });

  it("Given a slower prior search, when a later search resolves first, then the old result is ignored", async () => {
    vi.useFakeTimers();
    const prior = deferred<readonly SearchResult[]>();
    const later: SearchResult = { ...result, departmentName: "생활안전부" };
    const search = vi.fn((query: string) =>
      query === "교무" ? prior.promise : Promise.resolve([later]),
    );
    render(<WorkspaceSearch search={search} onResultSelect={vi.fn()} />);

    const input = screen.getByRole("combobox", { name: "전체 주차 검색" });
    fireEvent.change(input, { target: { value: "교무" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    fireEvent.change(input, { target: { value: "안전" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(screen.getByText("생활안전부")).toBeInTheDocument();
    await act(async () => {
      prior.resolve([result]);
    });
    expect(screen.getByText("생활안전부")).toBeInTheDocument();
    expect(screen.queryByText("교무기획부")).not.toBeInTheDocument();
  });
});
