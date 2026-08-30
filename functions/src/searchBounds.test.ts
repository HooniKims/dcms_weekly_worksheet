import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  buildIndexRecord,
  MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES,
  MAX_SEARCHABLE_PLAIN_TEXT_UTF8_BYTES,
} from "./searchPlanning.js";

const department = {
  id: "department-a",
  name: "교무기획부",
  order: 0,
  active: true,
  omitWhenEmpty: false,
};

describe("search index storage bounds", () => {
  it("truncates at the grapheme limit without splitting a grapheme", () => {
    // Given
    const family = "👨‍👩‍👧‍👦";
    const oversized = `${"가".repeat(MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES - 1)}${family}끝`;

    // When
    const record = buildIndexRecord({
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department,
      plainText: oversized,
      updatedAt: "now",
    });
    const graphemes = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(record.plainText),
    );

    // Then
    expect(graphemes).toHaveLength(MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES);
    expect(record.plainText.endsWith(family)).toBe(true);
    expect(record.plainText.endsWith("끝")).toBe(false);
    expect(record.normalizedText.startsWith("교무기획부 가가")).toBe(true);
    expect(record.grams.length).toBeLessThan(MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES + 100);
  });

  it("keeps legacy multibyte text below the UTF-8 byte budget", () => {
    // Given
    const family = "👨‍👩‍👧‍👦";
    const oversized = family.repeat(MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES);

    // When
    const record = buildIndexRecord({
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department,
      plainText: oversized,
      updatedAt: "now",
    });

    // Then
    expect(record.plainText.length).toBeGreaterThan(0);
    expect(record.plainText.endsWith(family)).toBe(true);
    expect(Buffer.byteLength(record.plainText, "utf8")).toBeLessThanOrEqual(
      MAX_SEARCHABLE_PLAIN_TEXT_UTF8_BYTES,
    );
  });
});
