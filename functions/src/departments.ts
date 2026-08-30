import { z } from "zod";
import {
  type DepartmentRecord,
  normalizeActiveDepartments,
  normalizeSearchText,
} from "./searchPlanning.js";
import { calendarDateSchema } from "./validation.js";

const departmentInputSchema: z.ZodType<DepartmentRecord> = z
  .object({
    id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
    name: z
      .string()
      .max(80)
      .refine((name) => name.normalize("NFKC").replace(/\s+/gu, " ").trim().length > 0),
    order: z.number().int().nonnegative(),
    active: z.boolean(),
    omitWhenEmpty: z.boolean(),
  })
  .strict();

export const updateDepartmentsInputSchema = z
  .object({
    weekId: calendarDateSchema,
    departments: z.array(departmentInputSchema).min(1).max(100),
  })
  .strict()
  .superRefine(({ departments }, context) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const [index, department] of departments.entries()) {
      if (ids.has(department.id)) {
        context.addIssue({
          code: "custom",
          message: "duplicate department id",
          path: ["departments", index, "id"],
        });
      }
      ids.add(department.id);
      const normalizedName = normalizeSearchText(department.name);
      if (names.has(normalizedName)) {
        context.addIssue({
          code: "custom",
          message: "duplicate department name",
          path: ["departments", index, "name"],
        });
      }
      names.add(normalizedName);
    }
    if (!departments.some(({ active }) => active)) {
      context.addIssue({
        code: "custom",
        message: "active department required",
        path: ["departments"],
      });
    }
  });

export type DepartmentUpdateInput = Readonly<{
  weekId: string;
  departments: readonly DepartmentRecord[];
}>;

type MasterDepartmentWrite = {
  readonly id: string;
  readonly data: {
    readonly name: string;
    readonly order: number;
    readonly active: true;
    readonly omitWhenEmpty: boolean;
  };
};

export type DepartmentUpdatePlan = {
  readonly masterUpserts: readonly MasterDepartmentWrite[];
  readonly deactivateIds: readonly string[];
  readonly snapshotWrite: {
    readonly weekId: string;
    readonly departments: ReturnType<typeof normalizeActiveDepartments>;
  };
};

export function planDepartmentUpdate(
  input: DepartmentUpdateInput,
  existingMasterIds: readonly string[],
): DepartmentUpdatePlan {
  const departments = normalizeActiveDepartments(input.departments);
  const submittedIds = new Set(departments.map(({ id }) => id));
  return {
    masterUpserts: departments.map((department) => ({
      id: department.id,
      data: {
        name: department.name,
        order: department.order,
        active: true,
        omitWhenEmpty: department.omitWhenEmpty,
      },
    })),
    deactivateIds: existingMasterIds.filter((id) => !submittedIds.has(id)),
    snapshotWrite: { weekId: input.weekId, departments },
  };
}

type PersistResult =
  | { readonly kind: "updated"; readonly updated: number }
  | { readonly kind: "missing" };

export interface DepartmentUpdateGateway {
  persist(input: DepartmentUpdateInput): Promise<PersistResult>;
  refreshIndex(weekId: string): Promise<unknown>;
}

export type DepartmentUpdateResponse = {
  readonly updated: number;
  readonly indexStatus: "fresh" | "stale";
};

export class DepartmentWeekNotFoundError extends Error {
  readonly name = "DepartmentWeekNotFoundError";

  constructor(readonly weekId: string) {
    super(`week ${weekId} not found`);
  }
}

export async function executeDepartmentUpdate(
  input: DepartmentUpdateInput,
  gateway: DepartmentUpdateGateway,
): Promise<DepartmentUpdateResponse> {
  const persisted = await gateway.persist(input);
  if (persisted.kind === "missing") {
    throw new DepartmentWeekNotFoundError(input.weekId);
  }
  const indexStatus = await gateway.refreshIndex(input.weekId).then(
    (): "fresh" => "fresh",
    (): "stale" => "stale",
  );
  return { updated: persisted.updated, indexStatus };
}
