import { FieldValue, type Firestore, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { planSnapshotIndexAction } from "./entryPlanning.js";
import {
  buildIndexRecord,
  chunkSearchIndexPlan,
  type EntryRecord,
  planSearchIndexRebuild,
  type SearchIndexCounts,
  type SearchIndexPlan,
  searchIndexId,
} from "./searchPlanning.js";

const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  active: z.boolean(),
  omitWhenEmpty: z.boolean(),
});
const weekDataSchema = z.object({
  dateLabel: z.string(),
  departmentSnapshot: z.array(departmentSchema),
});
const entryDataSchema = z.object({ plainText: z.string() });
async function executeSearchIndexPlan(
  db: Firestore,
  plan: SearchIndexPlan<FieldValue>,
): Promise<SearchIndexCounts> {
  const execution = chunkSearchIndexPlan(plan);
  for (const operations of execution.batches) {
    const batch = db.batch();
    for (const operation of operations) {
      switch (operation.kind) {
        case "upsert":
          batch.set(db.doc(`searchIndex/${operation.id}`), operation.record);
          break;
        case "delete":
          batch.delete(db.doc(`searchIndex/${operation.id}`));
          break;
      }
    }
    await batch.commit();
  }
  return execution.counts;
}

async function readWeekEntries(db: Firestore, weekId: string): Promise<readonly EntryRecord[]> {
  const snapshot = await db.collection(`weeks/${weekId}/entries`).get();
  return snapshot.docs.map((document) => ({
    weekId,
    departmentId: document.id,
    plainText: entryDataSchema.parse(document.data()).plainText,
  }));
}

export async function refreshWeekSearchIndex(weekId: string): Promise<SearchIndexCounts> {
  const db = getFirestore();
  const [weekDocument, entries, existing] = await Promise.all([
    db.doc(`weeks/${weekId}`).get(),
    readWeekEntries(db, weekId),
    db.collection("searchIndex").where("weekId", "==", weekId).get(),
  ]);
  if (!weekDocument.exists) {
    const deleteIds = existing.docs.map(({ id }) => id);
    return executeSearchIndexPlan(db, { upserts: [], deleteIds });
  }
  const weekData = weekDataSchema.parse(weekDocument.data());
  const plan = planSearchIndexRebuild({
    weeks: [{ id: weekId, ...weekData }],
    entries,
    existingIds: existing.docs.map(({ id }) => id),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return executeSearchIndexPlan(db, plan);
}

export async function refreshEntrySearchIndex(weekId: string, departmentId: string): Promise<void> {
  const db = getFirestore();
  const [weekDocument, entryDocument] = await Promise.all([
    db.doc(`weeks/${weekId}`).get(),
    db.doc(`weeks/${weekId}/entries/${departmentId}`).get(),
  ]);
  const indexReference = db.doc(`searchIndex/${searchIndexId(weekId, departmentId)}`);
  if (!weekDocument.exists) {
    await indexReference.delete();
    return;
  }
  const weekData = weekDataSchema.parse(weekDocument.data());
  const entryPlainText = entryDocument.exists
    ? entryDataSchema.parse(entryDocument.data()).plainText
    : null;
  const action = planSnapshotIndexAction(weekData.departmentSnapshot, departmentId, entryPlainText);
  if (action.kind === "delete") {
    await indexReference.delete();
    return;
  }
  await indexReference.set(
    buildIndexRecord({
      weekId,
      dateLabel: weekData.dateLabel,
      department: action.department,
      plainText: action.plainText,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );
}

export async function rebuildAllSearchIndexes(): Promise<SearchIndexCounts> {
  const db = getFirestore();
  const [weekSnapshot, existing] = await Promise.all([
    db.collection("weeks").get(),
    db.collection("searchIndex").get(),
  ]);
  const weeks = weekSnapshot.docs.map((document) => ({
    id: document.id,
    ...weekDataSchema.parse(document.data()),
  }));
  const entries = (await Promise.all(weeks.map(({ id }) => readWeekEntries(db, id)))).flat();
  const plan = planSearchIndexRebuild({
    weeks,
    entries,
    existingIds: existing.docs.map(({ id }) => id),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return executeSearchIndexPlan(db, plan);
}
