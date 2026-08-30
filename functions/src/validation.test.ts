import { describe, expect, it } from "vitest";
import { calendarDateSchema, weekInputSchema } from "./validation.js";

describe("calendar date boundary", () => {
  it.each(["2026-02-30", "2026-99-99", "0000-01-01", "2026-2-03"])(
    "rejects invalid week ID %s",
    (weekId) => {
      // Given / When
      const result = calendarDateSchema.safeParse(weekId);

      // Then
      expect(result.success).toBe(false);
    },
  );

  it.each(["2024-02-29", "2026-08-31"])("accepts real calendar date %s", (weekId) => {
    // Given / When
    const result = weekInputSchema.safeParse({ weekId });

    // Then
    expect(result.success).toBe(true);
  });
});
