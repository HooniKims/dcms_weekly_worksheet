import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { planSearchIndexRebuild } from "./searchPlanning.js";
import { planWeekArchive, planWeekRestore } from "./weekLifecycle.js";

const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  active: z.boolean(),
  omitWhenEmpty: z.boolean(),
});
const weekSchema = z.object({
  dateLabel: z.string(),
  archivedAt: z.unknown().optional(),
  departmentSnapshot: z.array(departmentSchema),
});
const entrySchema = z.object({ plainText: z.string() });

export class WeekNotFoundError extends Error {
  readonly name = "WeekNotFoundError";

  constructor(readonly weekId: string) {
    super(`week ${weekId} was not found`);
  }
}

export class LastActiveWeekError extends Error {
  readonly name = "LastActiveWeekError";

  constructor(readonly weekId: string) {
    super(`week ${weekId} is the last active week`);
  }
}

export async function archiveWeekDocument(
  weekId: string,
): Promise<Readonly<{ status: "archived" | "unchanged" }>> {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const weekReference = db.doc(`weeks/${weekId}`);
    const [target, allWeeks, existingIndexes] = await Promise.all([
      transaction.get(weekReference),
      transaction.get(db.collection("weeks")),
      transaction.get(db.collection("searchIndex").where("weekId", "==", weekId)),
    ]);
    const targetArchived = target.exists && target.get("archivedAt") != null;
    const decision = planWeekArchive({
      targetExists: target.exists,
      targetArchived,
      activeWeekCount: allWeeks.docs.filter((week) => week.get("archivedAt") == null).length,
    });
    switch (decision.kind) {
      case "not_found":
        throw new WeekNotFoundError(weekId);
      case "last_active":
        throw new LastActiveWeekError(weekId);
      case "unchanged":
        return { status: "unchanged" };
      case "archive":
        transaction.update(weekReference, { archivedAt: FieldValue.serverTimestamp() });
        for (const indexDocument of existingIndexes.docs) transaction.delete(indexDocument.ref);
        return { status: "archived" };
      default:
        return assertNever(decision);
    }
  });
}

export async function restoreWeekDocument(
  weekId: string,
): Promise<Readonly<{ status: "restored" | "unchanged" }>> {
  const db = getFirestore();
  return db.runTransaction(async (transaction) => {
    const weekReference = db.doc(`weeks/${weekId}`);
    const [target, entries, existingIndexes] = await Promise.all([
      transaction.get(weekReference),
      transaction.get(db.collection(`weeks/${weekId}/entries`)),
      transaction.get(db.collection("searchIndex").where("weekId", "==", weekId)),
    ]);
    const targetArchived = target.exists && target.get("archivedAt") != null;
    const decision = planWeekRestore({ targetExists: target.exists, targetArchived });
    switch (decision.kind) {
      case "not_found":
        throw new WeekNotFoundError(weekId);
      case "unchanged":
        return { status: "unchanged" };
      case "restore": {
        const data = weekSchema.parse(target.data());
        const plan = planSearchIndexRebuild({
          weeks: [{ id: weekId, ...data, archivedAt: null }],
          entries: entries.docs.map((entry) => ({
            weekId,
            departmentId: entry.id,
            plainText: entrySchema.parse(entry.data()).plainText,
          })),
          existingIds: existingIndexes.docs.map(({ id }) => id),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(weekReference, { archivedAt: null });
        for (const id of plan.deleteIds) transaction.delete(db.doc(`searchIndex/${id}`));
        for (const upsert of plan.upserts) {
          transaction.set(db.doc(`searchIndex/${upsert.id}`), upsert.record);
        }
        return { status: "restored" };
      }
      default:
        return assertNever(decision);
    }
  });
}

function assertNever(value: never): never {
  throw new UnexpectedWeekLifecycleDecisionError(value);
}

class UnexpectedWeekLifecycleDecisionError extends Error {
  readonly name = "UnexpectedWeekLifecycleDecisionError";

  constructor(readonly value: never) {
    super("unexpected week lifecycle decision");
  }
}
