import { describe, expect, it } from "vitest";
import {
  type DepartmentUpdateGateway,
  DepartmentWeekNotFoundError,
  executeDepartmentUpdate,
  planDepartmentUpdate,
  updateDepartmentsInputSchema,
} from "./departments.js";

const activeDepartment = {
  id: "department-a",
  name: "교무기획부",
  order: 4,
  active: true,
  omitWhenEmpty: false,
};

describe("department administration", () => {
  it.each([
    {
      label: "duplicate IDs",
      departments: [activeDepartment, { ...activeDepartment, name: "연구부" }],
    },
    {
      label: "duplicate normalized names",
      departments: [
        activeDepartment,
        { ...activeDepartment, id: "department-b", name: " 교무기획부 " },
      ],
    },
    {
      label: "blank names",
      departments: [{ ...activeDepartment, name: " \n\t " }],
    },
    {
      label: "suspicious IDs",
      departments: [{ ...activeDepartment, id: "../departments/admin" }],
    },
    {
      label: "zero active departments",
      departments: [{ ...activeDepartment, active: false }],
    },
  ])("rejects $label at the callable boundary", ({ departments }) => {
    // Given
    const input = { weekId: "2026-08-31", departments };

    // When
    const result = updateDepartmentsInputSchema.safeParse(input);

    // Then
    expect(result.success).toBe(false);
  });

  it("plans active upserts, soft-deactivation, and only the selected snapshot", () => {
    // Given
    const selectedWeekId = "2026-08-31";

    // When
    const plan = planDepartmentUpdate({ weekId: selectedWeekId, departments: [activeDepartment] }, [
      "department-a",
      "department-removed",
    ]);

    // Then
    expect(plan.masterUpserts).toEqual([
      {
        id: "department-a",
        data: { name: "교무기획부", order: 0, active: true, omitWhenEmpty: false },
      },
    ]);
    expect(plan.deactivateIds).toEqual(["department-removed"]);
    expect(plan.snapshotWrite).toEqual({
      weekId: selectedWeekId,
      departments: [{ ...activeDepartment, order: 0 }],
    });
  });

  it("rejects a formatted but impossible selected week date", () => {
    // Given / When
    const result = updateDepartmentsInputSchema.safeParse({
      weekId: "2026-02-30",
      departments: [activeDepartment],
    });

    // Then
    expect(result.success).toBe(false);
  });

  it("reports not found and never refreshes the index when the selected week is missing", async () => {
    // Given
    let refreshes = 0;
    const gateway: DepartmentUpdateGateway = {
      async persist() {
        return { kind: "missing" };
      },
      async refreshIndex() {
        refreshes += 1;
      },
    };
    const input = { weekId: "2026-08-31", departments: [activeDepartment] };

    // When
    const operation = executeDepartmentUpdate(input, gateway);

    // Then
    await expect(operation).rejects.toBeInstanceOf(DepartmentWeekNotFoundError);
    expect(refreshes).toBe(0);
  });

  it("returns stale after a refresh failure without rolling back persisted source data", async () => {
    // Given
    let persisted = false;
    const gateway: DepartmentUpdateGateway = {
      async persist() {
        persisted = true;
        return { kind: "updated", updated: 1 };
      },
      async refreshIndex() {
        throw new IndexRefreshTestError();
      },
    };
    const input = { weekId: "2026-08-31", departments: [activeDepartment] };

    // When
    const response = await executeDepartmentUpdate(input, gateway);

    // Then
    expect(response).toEqual({ updated: 1, indexStatus: "stale" });
    expect(persisted).toBe(true);
  });
});

class IndexRefreshTestError extends Error {
  readonly name = "IndexRefreshTestError";
}
