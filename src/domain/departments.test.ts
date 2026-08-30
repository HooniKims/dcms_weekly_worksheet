import { describe, expect, it } from "vitest";
import { findClosestDepartmentId } from "./departments";

const departments = [
  { id: "career", name: "진로교육부", order: 0, active: true, omitWhenEmpty: false },
  { id: "science", name: "과학정보부", order: 1, active: true, omitWhenEmpty: false },
  { id: "admin", name: "교무기획부", order: 2, active: true, omitWhenEmpty: false },
] as const;

describe("findClosestDepartmentId", () => {
  it("recommends the most similarly named current department after department renames", () => {
    expect(findClosestDepartmentId("진로진학부", departments)).toBe("career");
  });

  it("falls back to the first current department when no name is similar", () => {
    expect(findClosestDepartmentId("완전히 다른 조직", departments)).toBe("career");
  });
});
