import { describe, expect, it } from "vitest";
import {
  buildIndexRecord,
  chunkSearchIndexPlan,
  type DepartmentRecord,
  type EntryRecord,
  normalizeActiveDepartments,
  normalizeSearchText,
  planSearchIndexRebuild,
  searchGrams,
  type WeekRecord,
} from "./searchPlanning.js";

const departmentB: DepartmentRecord = {
  id: "department-b",
  name: "  교육  연구부 ",
  order: 8,
  active: true,
  omitWhenEmpty: true,
};
const inactiveDepartment: DepartmentRecord = {
  id: "department-c",
  name: "비활성",
  order: 1,
  active: false,
  omitWhenEmpty: false,
};
const departmentA: DepartmentRecord = {
  id: "department-a",
  name: "교무기획부",
  order: 3,
  active: true,
  omitWhenEmpty: false,
};
const departments: readonly DepartmentRecord[] = [departmentB, inactiveDepartment, departmentA];

describe("backend search index helpers", () => {
  it("normalizes NFKC, lowercase, and whitespace when text is untrusted", () => {
    // Given
    const source = "  ＡＢＣ\n\t교무   기획부  ";

    // When
    const normalized = normalizeSearchText(source);

    // Then
    expect(normalized).toBe("abc 교무 기획부");
  });

  it("returns unique consecutive Korean grapheme bigrams in insertion order", () => {
    // Given
    const source = "가나다가";

    // When
    const grams = searchGrams(source);

    // Then
    expect(grams).toEqual(["가나", "나다", "다가"]);
  });

  it("filters inactive departments, trims names, and normalizes active order", () => {
    // Given
    const submitted = departments;

    // When
    const normalized = normalizeActiveDepartments(submitted);

    // Then
    expect(normalized).toEqual([
      { id: "department-a", name: "교무기획부", order: 0, active: true, omitWhenEmpty: false },
      { id: "department-b", name: "교육 연구부", order: 1, active: true, omitWhenEmpty: true },
    ]);
  });

  it("creates a name-searchable index record for an empty department", () => {
    // Given
    const input = {
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department: departmentA,
      plainText: "",
      updatedAt: "now",
    };

    // When
    const record = buildIndexRecord(input);

    // Then
    expect(record).toEqual({
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      departmentId: "department-a",
      departmentName: "교무기획부",
      plainText: "",
      normalizedText: "교무기획부",
      grams: ["교무", "무기", "기획", "획부"],
      updatedAt: "now",
    });
  });

  it("combines a populated entry with its department name", () => {
    // Given
    const input = {
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department: departmentA,
      plainText: "  주간   업무 ",
      updatedAt: "now",
    };

    // When
    const record = buildIndexRecord(input);

    // Then
    expect(record.normalizedText).toBe("교무기획부 주간 업무");
    expect(record.plainText).toBe("  주간   업무 ");
    expect(record.grams).toContain("주간");
  });

  it("reflects a department rename without changing its deterministic identity", () => {
    // Given
    const renamed = { ...departmentA, name: "학사운영부" };

    // When
    const record = buildIndexRecord({
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department: renamed,
      plainText: "주간 업무",
      updatedAt: "now",
    });

    // Then
    expect(record.departmentId).toBe("department-a");
    expect(record.departmentName).toBe("학사운영부");
    expect(record.normalizedText).toBe("학사운영부 주간 업무");
  });

  it("plans every week snapshot department and deletes stale index records", () => {
    // Given
    const weeks: readonly WeekRecord[] = [
      {
        id: "2026-08-31",
        dateLabel: "2026년 8월 31일",
        departmentSnapshot: departments,
      },
      {
        id: "2026-08-24",
        dateLabel: "2026년 8월 24일",
        departmentSnapshot: [departmentA],
      },
    ];
    const entries: readonly EntryRecord[] = [
      { weekId: "2026-08-31", departmentId: "department-a", plainText: "첫째 업무" },
      { weekId: "2026-08-24", departmentId: "department-a", plainText: "지난 업무" },
    ];

    // When
    const plan = planSearchIndexRebuild({
      weeks,
      entries,
      existingIds: ["2026-08-31__department-a", "stale__department"],
      updatedAt: "now",
    });

    // Then
    expect(plan.upserts.map(({ id }) => id)).toEqual([
      "2026-08-31__department-c",
      "2026-08-31__department-a",
      "2026-08-31__department-b",
      "2026-08-24__department-a",
    ]);
    expect(plan.upserts.map(({ record }) => record.plainText)).toEqual([
      "",
      "첫째 업무",
      "",
      "지난 업무",
    ]);
    expect(plan.deleteIds).toEqual(["stale__department"]);
  });

  it("indexes a department whenever its ID remains in the week snapshot", () => {
    // Given
    const retainedInactive: DepartmentRecord = {
      id: "department-retained",
      name: "과거 부서",
      order: 0,
      active: false,
      omitWhenEmpty: false,
    };

    // When
    const plan = planSearchIndexRebuild({
      weeks: [
        {
          id: "2026-08-17",
          dateLabel: "2026년 8월 17일",
          departmentSnapshot: [retainedInactive],
        },
      ],
      entries: [],
      existingIds: ["2026-08-17__department-retained"],
      updatedAt: "now",
    });

    // Then
    expect(plan.upserts.map(({ id }) => id)).toEqual(["2026-08-17__department-retained"]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.upserts[0]?.record.plainText).toBe("");
  });

  it("Given an archived week, when rebuilding search, then its existing records are deleted without upserts", () => {
    // Given
    const archivedWeek: WeekRecord = {
      id: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      archivedAt: "2026-09-01T00:00:00.000Z",
      departmentSnapshot: [departmentA],
    };

    // When
    const plan = planSearchIndexRebuild({
      weeks: [archivedWeek],
      entries: [{ weekId: archivedWeek.id, departmentId: departmentA.id, plainText: "보존 내용" }],
      existingIds: ["2026-08-31__department-a"],
      updatedAt: "now",
    });

    // Then
    expect(plan.upserts).toEqual([]);
    expect(plan.deleteIds).toEqual(["2026-08-31__department-a"]);
  });

  it("splits rebuild writes below the batch limit and reports exact counts", () => {
    // Given
    const record = buildIndexRecord({
      weekId: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      department: departmentA,
      plainText: "",
      updatedAt: "now",
    });
    const plan = {
      upserts: Array.from({ length: 451 }, (_, index) => ({ id: `index-${index}`, record })),
      deleteIds: Array.from({ length: 451 }, (_, index) => `stale-${index}`),
    };

    // When
    const execution = chunkSearchIndexPlan(plan);

    // Then
    expect(execution.batches.map(({ length }) => length)).toEqual([450, 450, 2]);
    expect(execution.counts).toEqual({ indexed: 451, deleted: 451 });
  });
});
