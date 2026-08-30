import {
  buildIndexRecord,
  type DepartmentRecord,
  normalizeActiveDepartments,
  type SearchIndexRecord,
  searchIndexId,
} from "./searchPlanning.js";

type WeekCreationInput<TUpdatedAt> = {
  readonly weekExists: boolean;
  readonly weekId: string;
  readonly masterDepartments: readonly DepartmentRecord[];
  readonly fallbackDepartments: readonly DepartmentRecord[];
  readonly updatedAt: TUpdatedAt;
};

type WeekData<TUpdatedAt> = {
  readonly date: string;
  readonly dateLabel: string;
  readonly meetingTitle: "주간업무추진사항";
  readonly departmentSnapshot: readonly DepartmentRecord[];
  readonly createdBy: "admin";
  readonly createdAt: TUpdatedAt;
};

export type WeekWrite<TUpdatedAt> =
  | { readonly kind: "week"; readonly id: string; readonly data: WeekData<TUpdatedAt> }
  | {
      readonly kind: "index";
      readonly id: string;
      readonly data: SearchIndexRecord<TUpdatedAt>;
    };

export type WeekCreationPlan<TUpdatedAt> = {
  readonly created: boolean;
  readonly writes: readonly WeekWrite<TUpdatedAt>[];
};

export function planWeekCreation<TUpdatedAt>(
  input: WeekCreationInput<TUpdatedAt>,
): WeekCreationPlan<TUpdatedAt> {
  if (input.weekExists) return { created: false, writes: [] };
  const activeMaster = normalizeActiveDepartments(input.masterDepartments);
  const departments =
    activeMaster.length > 0 ? activeMaster : normalizeActiveDepartments(input.fallbackDepartments);
  const [year, month, day] = input.weekId.split("-").map(Number);
  const dateLabel = `${String(year)}년 ${String(month)}월 ${String(day)}일`;
  const weekWrite: WeekWrite<TUpdatedAt> = {
    kind: "week",
    id: input.weekId,
    data: {
      date: input.weekId,
      dateLabel,
      meetingTitle: "주간업무추진사항",
      departmentSnapshot: departments,
      createdBy: "admin",
      createdAt: input.updatedAt,
    },
  };
  const indexWrites: readonly WeekWrite<TUpdatedAt>[] = departments.map((department) => ({
    kind: "index",
    id: searchIndexId(input.weekId, department.id),
    data: buildIndexRecord({
      weekId: input.weekId,
      dateLabel,
      department,
      plainText: "",
      updatedAt: input.updatedAt,
    }),
  }));
  return { created: true, writes: [weekWrite, ...indexWrites] };
}
