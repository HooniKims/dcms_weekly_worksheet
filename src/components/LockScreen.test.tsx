import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockScreen } from "./LockScreen";

afterEach(cleanup);

describe("LockScreen", () => {
  it("shows the Deungchon school emblem when the lock screen opens", () => {
    // Given
    const unlock = vi.fn();

    // When
    render(<LockScreen onUnlock={unlock} showDemoHint={false} />);

    // Then
    expect(screen.getByRole("img", { name: "등촌중학교 교표" })).toHaveAttribute(
      "src",
      "/deungchon-logo.png",
    );
    const heading = screen.getByRole("heading", {
      name: "등촌중학교 주간업무 추진사항 수합 사이트",
    });
    expect(heading).toBeInTheDocument();
    expect(heading.querySelectorAll("br")).toHaveLength(2);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("explains an incorrect password without clearing the field", async () => {
    const user = userEvent.setup();
    const unlock = vi.fn().mockRejectedValue(new Error("wrong-password"));
    render(<LockScreen onUnlock={unlock} showDemoHint={false} />);

    const password = screen.getByLabelText("공용 비밀번호");
    await user.type(password, "틀린비밀번호");
    await user.click(screen.getByRole("button", { name: "업무 화면 열기" }));

    expect(await screen.findByText("비밀번호가 맞지 않습니다.")).toBeInTheDocument();
    expect(password).toHaveValue("틀린비밀번호");
  });
});
