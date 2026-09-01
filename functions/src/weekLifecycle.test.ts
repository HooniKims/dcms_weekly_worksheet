import { describe, expect, it } from "vitest";
import { planWeekArchive, planWeekRestore } from "./weekLifecycle.js";

describe("week lifecycle planning", () => {
  it("Given more than one active week, when archiving an active target, then it plans the archive", () => {
    // Given
    const input = { targetExists: true, targetArchived: false, activeWeekCount: 2 };

    // When
    const decision = planWeekArchive(input);

    // Then
    expect(decision).toEqual({ kind: "archive" });
  });

  it("Given the last active week, when archiving it, then the action is rejected", () => {
    // Given
    const input = { targetExists: true, targetArchived: false, activeWeekCount: 1 };

    // When
    const decision = planWeekArchive(input);

    // Then
    expect(decision).toEqual({ kind: "last_active" });
  });

  it("Given an already archived week, when archiving it again, then the action is idempotent", () => {
    // Given
    const input = { targetExists: true, targetArchived: true, activeWeekCount: 1 };

    // When
    const decision = planWeekArchive(input);

    // Then
    expect(decision).toEqual({ kind: "unchanged" });
  });

  it("Given an archived week, when restoring it, then it plans the restore", () => {
    // Given
    const input = { targetExists: true, targetArchived: true };

    // When
    const decision = planWeekRestore(input);

    // Then
    expect(decision).toEqual({ kind: "restore" });
  });
});
