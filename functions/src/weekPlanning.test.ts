import { describe, expect, it } from "vitest";
import { planWeekCreation } from "./weekPlanning.js";

const masterDepartments = [
  { id: "department-a", name: "현재 부서", order: 5, active: true, omitWhenEmpty: false },
  { id: "department-old", name: "제외 부서", order: 0, active: false, omitWhenEmpty: false },
];
const fallbackDepartments = [
  { id: "department-fallback", name: "기본 부서", order: 0, active: true, omitWhenEmpty: false },
];

describe("manual week creation planning", () => {
  it("plans no writes when the week already exists", () => {
    // Given / When
    const plan = planWeekCreation({
      weekExists: true,
      weekId: "2026-08-31",
      masterDepartments,
      fallbackDepartments,
      updatedAt: "now",
    });

    // Then
    expect(plan).toEqual({ created: false, writes: [] });
  });

  it("plans one week and one name-only index write per active snapshot department", () => {
    // Given / When
    const plan = planWeekCreation({
      weekExists: false,
      weekId: "2026-08-31",
      masterDepartments,
      fallbackDepartments,
      updatedAt: "now",
    });

    // Then
    expect(plan.created).toBe(true);
    expect(plan.writes.map(({ kind }) => kind)).toEqual(["week", "index"]);
    expect(plan.writes[0]).toMatchObject({
      kind: "week",
      id: "2026-08-31",
      data: { createdBy: "admin", departmentSnapshot: [{ ...masterDepartments[0], order: 0 }] },
    });
    expect(plan.writes[1]).toMatchObject({
      kind: "index",
      id: "2026-08-31__department-a",
      data: { departmentId: "department-a", plainText: "" },
    });
  });
});
