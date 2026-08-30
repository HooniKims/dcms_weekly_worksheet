import { describe, expect, it } from "vitest";
import {
  formatKoreanDate,
  formatKoreanDateWithWeekday,
  scheduledWeekId,
  weekIdFromDate,
} from "./week";

describe("week", () => {
  it("uses the local calendar date as a stable week id", () => {
    expect(weekIdFromDate(new Date("2026-08-31T00:05:00+09:00"))).toBe("2026-08-31");
  });

  it("creates the following Monday when the scheduler runs on Monday", () => {
    expect(scheduledWeekId(new Date("2026-08-31T00:05:00+09:00"))).toBe("2026-09-07");
  });

  it("formats the date for the existing report heading", () => {
    expect(formatKoreanDate("2026-09-07")).toBe("2026년 9월 7일");
  });

  it("formats the source-sheet date with its weekday", () => {
    expect(formatKoreanDateWithWeekday("2026-08-31")).toBe("2026년 8월 31일 (월)");
  });
});
