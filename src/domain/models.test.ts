import { describe, expect, it } from "vitest";
import { weekSchema } from "./models";

describe("week model", () => {
  it("Given a legacy active week, when parsing it, then it remains active without an archive timestamp", () => {
    // Given
    const legacyWeek = {
      id: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      meetingTitle: "주간업무추진사항",
      createdBy: "migration",
      createdAt: "2026-08-31T00:00:00.000Z",
      departmentSnapshot: [],
    };

    // When
    const parsed = weekSchema.parse(legacyWeek);

    // Then
    expect(parsed.archivedAt).toBeUndefined();
  });

  it("Given an archived week, when parsing it, then its archive timestamp is preserved", () => {
    // Given
    const archivedAt = "2026-09-01T01:23:45.000Z";

    // When
    const parsed = weekSchema.parse({
      id: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      meetingTitle: "주간업무추진사항",
      createdBy: "migration",
      createdAt: "2026-08-31T00:00:00.000Z",
      departmentSnapshot: [],
      archivedAt,
    });

    // Then
    expect(parsed.archivedAt).toBe(archivedAt);
  });
});
