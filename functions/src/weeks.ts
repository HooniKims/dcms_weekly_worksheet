import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { DepartmentRecord } from "./searchPlanning.js";
import { planWeekCreation } from "./weekPlanning.js";

export const defaultDepartmentNames: readonly string[] = [
  "말씀 및 기도",
  "교장(교감)",
  "교무기획부",
  "교육연구부",
  "생활안전부",
  "창체활동부",
  "과학정보부",
  "인성상담부",
  "통합지원부",
  "진로진학부",
  "행정실",
];

const departmentDataSchema = z.object({
  name: z.string(),
  order: z.number(),
  active: z.boolean(),
  omitWhenEmpty: z.boolean(),
});

function defaultDepartments(): readonly DepartmentRecord[] {
  return defaultDepartmentNames.map((name, order) => ({
    id: `department-${String(order + 1).padStart(2, "0")}`,
    name,
    order,
    active: true,
    omitWhenEmpty: order === 0,
  }));
}

export async function ensureWeek(weekId: string): Promise<boolean> {
  const db = getFirestore();
  const weekRef = db.doc(`weeks/${weekId}`);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(weekRef);
    if (existing.exists) return false;
    const departmentSnapshot = await transaction.get(db.collection("departments").orderBy("order"));
    const masterDepartments = departmentSnapshot.docs.map((document) => ({
      id: document.id,
      ...departmentDataSchema.parse(document.data()),
    }));
    const plan = planWeekCreation({
      weekExists: false,
      weekId,
      masterDepartments,
      fallbackDepartments: defaultDepartments(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const write of plan.writes) {
      switch (write.kind) {
        case "week":
          transaction.create(db.doc(`weeks/${write.id}`), write.data);
          break;
        case "index":
          transaction.create(db.doc(`searchIndex/${write.id}`), write.data);
          break;
        default:
          assertNever(write);
      }
    }
    return plan.created;
  });
}

function assertNever(value: never): never {
  throw new UnexpectedWeekWriteError(value);
}

class UnexpectedWeekWriteError extends Error {
  readonly name = "UnexpectedWeekWriteError";

  constructor(readonly value: never) {
    super("unexpected week write");
  }
}
