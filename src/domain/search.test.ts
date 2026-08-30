import { describe, expect, it } from "vitest";
import { searchIndexRecordSchema, searchResultSchema } from "./models";
import { matchesSearch, normalizeSearchText, searchExcerpt, searchGrams } from "./search";

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeCount(value: string): number {
  return Array.from(graphemeSegmenter.segment(value)).length;
}

describe("search domain helpers", () => {
  it("normalizes Unicode, case, and whitespace", () => {
    expect(normalizeSearchText("  ＡＢＣ\n\t교무   기획부  ")).toBe("abc 교무 기획부");
  });

  it("returns unique consecutive normalized grams in insertion order", () => {
    expect(searchGrams("  A  B a  b  ")).toEqual(["a ", " b", "b ", " a"]);
  });

  it("returns no grams for normalized text shorter than two characters", () => {
    expect(searchGrams("  A ")).toEqual([]);
  });

  it("matches a Korean query after normalizing both record and query", () => {
    expect(matchesSearch("교무기획부 주간 업무", "  교무  ")).toBe(true);
  });

  it("does not match a normalized query shorter than two characters", () => {
    expect(matchesSearch("교무기획부", " 교 ")).toBe(false);
  });

  it("returns a centered excerpt with bounded length for a middle match", () => {
    const excerpt = searchExcerpt(
      "앞부분에 충분한 설명을 넣고 교무기획부의 핵심 업무를 기록한 뒤 뒷부분에도 충분한 설명을 이어갑니다.",
      "교무기획부",
      32,
    );

    expect(excerpt).toContain("교무기획부");
    expect(excerpt).toContain("…");
    expect(graphemeCount(excerpt)).toBeLessThanOrEqual(32);
  });

  it("returns a start excerpt with only a trailing ellipsis for an early match", () => {
    const excerpt = searchExcerpt("교무기획부의 업무와 이어지는 긴 설명입니다.", "교무", 12);

    expect(excerpt.startsWith("교무")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(graphemeCount(excerpt)).toBeLessThanOrEqual(12);
  });

  it("falls back deterministically to the normalized start when query is absent", () => {
    expect(searchExcerpt("  첫째   둘째 셋째 넷째  ", "없는", 10)).toBe("첫째 둘째 셋째…");
  });

  it("rejects unknown fields at search schema boundaries", () => {
    const indexRecord = searchIndexRecordSchema.safeParse({
      weekId: "2026-08-24",
      dateLabel: "2026년 8월 24일",
      departmentId: "department-01",
      departmentName: "교무기획부",
      plainText: "주간 업무",
      normalizedText: "주간 업무",
      grams: ["주간"],
      updatedAt: "2026-08-24T00:00:00.000Z",
      unexpected: "reject me",
    });
    const result = searchResultSchema.safeParse({
      weekId: "2026-08-24",
      dateLabel: "2026년 8월 24일",
      departmentId: "department-01",
      departmentName: "교무기획부",
      excerpt: "주간 업무",
      unexpected: "reject me",
    });

    expect(indexRecord.success).toBe(false);
    expect(result.success).toBe(false);
  });

  it("preserves a matched query when only one ellipsis fits the budget", () => {
    const excerpt = searchExcerpt("abcdef", "cd", 3);

    expect(excerpt).toContain("cd");
    expect(excerpt).toContain("…");
    expect(excerpt.match(/…/gu)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(graphemeCount(excerpt)).toBeLessThanOrEqual(3);
  });

  it("bounds excerpts by grapheme clusters without splitting a cluster", () => {
    const excerpt = searchExcerpt("👩‍💻abc", "없는", 2);

    expect(excerpt).toBe("👩‍💻…");
    expect(graphemeCount(excerpt)).toBe(2);
  });
});
