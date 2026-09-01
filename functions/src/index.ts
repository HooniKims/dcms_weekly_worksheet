import { createHash, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  type DepartmentUpdateResponse,
  DepartmentWeekArchivedError,
  DepartmentWeekNotFoundError,
  executeDepartmentUpdate,
  planDepartmentUpdate,
  updateDepartmentsInputSchema,
} from "./departments.js";
import { planEntryTrigger } from "./entryPlanning.js";
import {
  rebuildAllSearchIndexes,
  refreshEntrySearchIndex,
  refreshWeekSearchIndex,
} from "./search.js";
import {
  hashPassword,
  type PasswordRecord,
  planPasswordMaterialization,
  verifyPassword,
} from "./security.js";
import { weekInputSchema } from "./validation.js";
import {
  archiveWeekDocument,
  LastActiveWeekError,
  restoreWeekDocument,
  WeekNotFoundError,
} from "./weekLifecycleFirestore.js";
import { ensureWeek } from "./weeks.js";

initializeApp();

const region = "asia-northeast3";
const sitePassword = defineSecret("SITE_PASSWORD");
const adminPassword = defineSecret("ADMIN_PASSWORD");
const passwordInput = z.object({ password: z.string().min(4).max(128) });
const passwordRecordSchema = z
  .object({ hash: z.string(), salt: z.string(), sessionVersion: z.number().int().positive() })
  .strict();

async function passwordRecord(): Promise<PasswordRecord> {
  const db = getFirestore();
  const reference = db.doc("settingsPrivate/security");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) return passwordRecordSchema.parse(snapshot.data());
    const plan = planPasswordMaterialization(null, hashPassword(sitePassword.value(), 1));
    transaction.create(reference, plan.record);
    return plan.record;
  });
}

function requireAdmin(
  auth: Readonly<{ token: Readonly<Record<string, unknown>> }> | undefined,
): void {
  if (auth?.token.admin !== true)
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
}

function passwordsMatch(input: string, configured: string): boolean {
  const inputHash = createHash("sha256").update(input).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(inputHash, configuredHash);
}

export const unlockWithSharedPassword = onCall(
  { region, secrets: [sitePassword], enforceAppCheck: true },
  async (request) => {
    const input = passwordInput.safeParse(request.data);
    if (!input.success)
      throw new HttpsError("invalid-argument", "비밀번호 형식이 올바르지 않습니다.");
    const record = await passwordRecord();
    if (!verifyPassword(input.data.password, record))
      throw new HttpsError("permission-denied", "비밀번호가 맞지 않습니다.");
    const source =
      request.rawRequest.ip ?? request.rawRequest.headers["user-agent"] ?? "contributor";
    const uid = `shared-${createHash("sha256").update(source).digest("hex").slice(0, 24)}`;
    const customToken = await getAuth().createCustomToken(uid, {
      role: "contributor",
      sessionVersion: record.sessionVersion,
    });
    return { customToken };
  },
);

export const unlockAdminWithPassword = onCall(
  { region, secrets: [adminPassword], enforceAppCheck: true },
  async (request) => {
    const input = passwordInput.safeParse(request.data);
    if (!input.success)
      throw new HttpsError("invalid-argument", "비밀번호 형식이 올바르지 않습니다.");
    if (!passwordsMatch(input.data.password, adminPassword.value()))
      throw new HttpsError("permission-denied", "관리자 비밀번호가 맞지 않습니다.");
    const customToken = await getAuth().createCustomToken("shared-admin", {
      role: "admin",
      admin: true,
    });
    return { customToken };
  },
);

export const updateSharedPassword = onCall({ region, secrets: [sitePassword] }, async (request) => {
  requireAdmin(request.auth);
  const input = passwordInput.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "비밀번호 형식이 올바르지 않습니다.");
  const db = getFirestore();
  const reference = db.doc("settingsPrivate/security");
  const sessionVersion = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists
      ? passwordRecordSchema.parse(snapshot.data())
      : hashPassword(sitePassword.value(), 1);
    const replacement = hashPassword(input.data.password, current.sessionVersion + 1);
    transaction.set(reference, replacement);
    return replacement.sessionVersion;
  });
  return { sessionVersion };
});

export const createWeek = onCall({ region }, async (request) => {
  requireAdmin(request.auth);
  const input = weekInputSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError("invalid-argument", "주차 날짜가 올바르지 않습니다.");
  return { created: await ensureWeek(input.data.weekId) };
});

export const archiveWeek = onCall({ region }, async (request) => {
  requireAdmin(request.auth);
  const input = weekInputSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError("invalid-argument", "주차 날짜가 올바르지 않습니다.");
  try {
    return await archiveWeekDocument(input.data.weekId);
  } catch (error) {
    if (error instanceof WeekNotFoundError) {
      throw new HttpsError("not-found", "선택한 주차가 존재하지 않습니다.");
    }
    if (error instanceof LastActiveWeekError) {
      throw new HttpsError(
        "failed-precondition",
        "마지막 활성 주차는 휴지통으로 이동할 수 없습니다.",
      );
    }
    throw error;
  }
});

export const restoreWeek = onCall({ region }, async (request) => {
  requireAdmin(request.auth);
  const input = weekInputSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError("invalid-argument", "주차 날짜가 올바르지 않습니다.");
  try {
    return await restoreWeekDocument(input.data.weekId);
  } catch (error) {
    if (error instanceof WeekNotFoundError) {
      throw new HttpsError("not-found", "선택한 주차가 존재하지 않습니다.");
    }
    throw error;
  }
});

export const updateDepartments = onCall({ region }, async (request) => {
  requireAdmin(request.auth);
  const input = updateDepartmentsInputSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "부서 목록 형식이 올바르지 않습니다.");
  }
  const db = getFirestore();
  let response: DepartmentUpdateResponse;
  try {
    response = await executeDepartmentUpdate(input.data, {
      async persist(updateInput) {
        return db.runTransaction(async (transaction) => {
          const weekReference = db.doc(`weeks/${updateInput.weekId}`);
          const [weekDocument, masterSnapshot] = await Promise.all([
            transaction.get(weekReference),
            transaction.get(db.collection("departments")),
          ]);
          if (!weekDocument.exists) return { kind: "missing" };
          if (weekDocument.get("archivedAt") != null) return { kind: "archived" };
          const plan = planDepartmentUpdate(
            updateInput,
            masterSnapshot.docs.map(({ id }) => id),
          );
          for (const upsert of plan.masterUpserts) {
            transaction.set(db.doc(`departments/${upsert.id}`), upsert.data);
          }
          for (const id of plan.deactivateIds) {
            transaction.update(db.doc(`departments/${id}`), { active: false });
          }
          transaction.update(weekReference, {
            departmentSnapshot: plan.snapshotWrite.departments,
          });
          return { kind: "updated", updated: plan.snapshotWrite.departments.length };
        });
      },
      refreshIndex: refreshWeekSearchIndex,
    });
  } catch (error) {
    if (error instanceof DepartmentWeekNotFoundError) {
      throw new HttpsError("not-found", "선택한 주차가 존재하지 않습니다.");
    }
    if (error instanceof DepartmentWeekArchivedError) {
      throw new HttpsError("failed-precondition", "휴지통 주차는 복원한 뒤 수정해 주세요.");
    }
    throw error;
  }
  if (response.indexStatus === "stale") {
    logger.warn("search_index.refresh_stale", { weekId: input.data.weekId });
  }
  return response;
});

export const rebuildSearchIndex = onCall({ region }, async (request) => {
  requireAdmin(request.auth);
  return rebuildAllSearchIndexes();
});

export const archiveEntryRevision = onDocumentWritten(
  { region, document: "weeks/{weekId}/entries/{departmentId}" },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (before === undefined || after === undefined) return;
    const triggerPlan = planEntryTrigger({
      beforeVersion: before.exists ? Number(before.get("version") ?? 0) : null,
      afterExists: after.exists,
    });
    for (const version of triggerPlan.archiveVersions) {
      await after.ref
        .collection("revisions")
        .doc(String(version))
        .set({ ...before.data(), archivedAt: FieldValue.serverTimestamp() });
    }
    await refreshEntrySearchIndex(event.params.weekId, event.params.departmentId);
  },
);
