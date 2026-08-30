import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { type DecodedIdToken, getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import {
  DepartmentWeekNotFoundError,
  executeDepartmentUpdate,
  planDepartmentUpdate,
  updateDepartmentsInputSchema,
} from "../functions/src/departments.js";
import {
  rebuildAllSearchIndexes,
  refreshEntrySearchIndex,
  refreshWeekSearchIndex,
} from "../functions/src/searchFirestore.js";
import { ensureWeek } from "../functions/src/weeks.js";

type ApiRequest = IncomingMessage & Readonly<{ body?: unknown }>;
type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(value: unknown): void;
};

const passwordInputSchema = z.object({ password: z.string().min(4).max(128) }).strict();
const requestSchema = z
  .object({
    action: z.enum([
      "unlockWithSharedPassword",
      "unlockAdminWithPassword",
      "createWeek",
      "updateDepartments",
      "saveEntry",
      "rebuildSearchIndex",
    ]),
    data: z.unknown(),
  })
  .strict();
const weekInputSchema = z.object({ weekId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();
const saveEntryInputSchema = z
  .object({
    weekId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    departmentId: z.string().min(1).max(80),
    htmlContent: z.string().max(200_000),
    plainText: z.string().max(8_000),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();

class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new ApiError(500, `missing-${name}`);
  return value;
}

function initializeFirebaseAdmin(): void {
  if (getApps().length > 0) return;
  const projectId = requiredEnvironment("FIREBASE_PROJECT_ID");
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const credential =
    clientEmail !== undefined && privateKey !== undefined
      ? cert({ projectId, clientEmail, privateKey: privateKey.replaceAll("\\n", "\n") })
      : applicationDefault();
  initializeApp({ credential, projectId });
}

function passwordsMatch(input: string, configured: string): boolean {
  const inputHash = createHash("sha256").update(input).digest();
  const configuredHash = createHash("sha256").update(configured).digest();
  return timingSafeEqual(inputHash, configuredHash);
}

function requestIp(request: ApiRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? "contributor";
  if (Array.isArray(forwarded)) return forwarded[0] ?? "contributor";
  return request.socket.remoteAddress ?? "contributor";
}

async function bearerClaims(request: ApiRequest): Promise<DecodedIdToken> {
  const authorization = request.headers.authorization;
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new ApiError(401, "authentication-required");
  }
  try {
    return await getAuth().verifyIdToken(authorization.slice("Bearer ".length));
  } catch {
    throw new ApiError(401, "invalid-session");
  }
}

async function requireContributor(request: ApiRequest): Promise<DecodedIdToken> {
  const claims = await bearerClaims(request);
  if (claims.admin === true) return claims;
  if (claims.role !== "contributor" || !Number.isInteger(claims.sessionVersion)) {
    throw new ApiError(403, "contributor-required");
  }
  const security = await getFirestore().doc("settingsPrivate/security").get();
  if (!security.exists || security.get("sessionVersion") !== claims.sessionVersion) {
    throw new ApiError(401, "session-expired");
  }
  return claims;
}

async function requireAdmin(request: ApiRequest): Promise<void> {
  const claims = await bearerClaims(request);
  if (claims.admin !== true) throw new ApiError(403, "admin-required");
}

async function unlockContributor(request: ApiRequest, data: unknown): Promise<unknown> {
  const input = passwordInputSchema.parse(data);
  if (!passwordsMatch(input.password, requiredEnvironment("SITE_PASSWORD"))) {
    throw new ApiError(403, "wrong-password");
  }
  const securityReference = getFirestore().doc("settingsPrivate/security");
  const sessionVersion = await getFirestore().runTransaction(async (transaction) => {
    const security = await transaction.get(securityReference);
    const currentVersion = security.exists ? security.get("sessionVersion") : undefined;
    if (typeof currentVersion === "number" && Number.isInteger(currentVersion)) {
      return currentVersion;
    }
    transaction.set(securityReference, { sessionVersion: 1 }, { merge: true });
    return 1;
  });
  const uid = `shared-${createHash("sha256").update(requestIp(request)).digest("hex").slice(0, 24)}`;
  const customToken = await getAuth().createCustomToken(uid, {
    role: "contributor",
    sessionVersion,
  });
  return { customToken };
}

async function unlockAdmin(data: unknown): Promise<unknown> {
  const input = passwordInputSchema.parse(data);
  if (!passwordsMatch(input.password, requiredEnvironment("ADMIN_PASSWORD"))) {
    throw new ApiError(403, "wrong-admin-password");
  }
  return {
    customToken: await getAuth().createCustomToken("shared-admin", { role: "admin", admin: true }),
  };
}

async function createWeek(request: ApiRequest, data: unknown): Promise<unknown> {
  await requireAdmin(request);
  const input = weekInputSchema.parse(data);
  return { created: await ensureWeek(input.weekId) };
}

async function updateDepartments(request: ApiRequest, data: unknown): Promise<unknown> {
  await requireAdmin(request);
  const input = updateDepartmentsInputSchema.parse(data);
  try {
    return await executeDepartmentUpdate(input, {
      async persist(updateInput) {
        const db = getFirestore();
        return db.runTransaction(async (transaction) => {
          const weekReference = db.doc(`weeks/${updateInput.weekId}`);
          const [weekDocument, masterSnapshot] = await Promise.all([
            transaction.get(weekReference),
            transaction.get(db.collection("departments")),
          ]);
          if (!weekDocument.exists) return { kind: "missing" } as const;
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
          return { kind: "updated", updated: plan.snapshotWrite.departments.length } as const;
        });
      },
      refreshIndex: refreshWeekSearchIndex,
    });
  } catch (error) {
    if (error instanceof DepartmentWeekNotFoundError) throw new ApiError(404, "week-not-found");
    throw error;
  }
}

async function saveEntry(request: ApiRequest, data: unknown): Promise<unknown> {
  const claims = await requireContributor(request);
  const input = saveEntryInputSchema.parse(data);
  const db = getFirestore();
  const entryReference = db.doc(`weeks/${input.weekId}/entries/${input.departmentId}`);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entryReference);
    const latestVersion = snapshot.exists ? Number(snapshot.get("version") ?? 0) : 0;
    if (latestVersion !== input.expectedVersion) {
      return {
        status: "conflict" as const,
        latest: snapshot.exists
          ? {
              departmentId: input.departmentId,
              htmlContent: String(snapshot.get("htmlContent") ?? ""),
              plainText: String(snapshot.get("plainText") ?? ""),
              version: latestVersion,
              updatedAt: snapshot.get("updatedAt")?.toDate?.().toISOString?.() ?? "",
              updatedByRole: snapshot.get("updatedByRole") === "admin" ? "admin" : "contributor",
            }
          : {
              departmentId: input.departmentId,
              htmlContent: "",
              plainText: "",
              version: 0,
              updatedAt: "",
              updatedByRole: "contributor" as const,
            },
      };
    }
    if (snapshot.exists && latestVersion > 0) {
      transaction.set(entryReference.collection("revisions").doc(String(latestVersion)), {
        ...snapshot.data(),
        archivedAt: FieldValue.serverTimestamp(),
      });
    }
    const updatedAt = new Date().toISOString();
    const entry = {
      departmentId: input.departmentId,
      htmlContent: input.htmlContent,
      plainText: input.plainText,
      version: latestVersion + 1,
      updatedAt,
      updatedByRole: claims.admin === true ? ("admin" as const) : ("contributor" as const),
    };
    transaction.set(entryReference, { ...entry, updatedAt: FieldValue.serverTimestamp() });
    return { status: "saved" as const, entry };
  });
  if (result.status === "saved") {
    await refreshEntrySearchIndex(input.weekId, input.departmentId);
  }
  return result;
}

async function executeAction(
  request: ApiRequest,
  action: z.infer<typeof requestSchema>["action"],
  data: unknown,
): Promise<unknown> {
  switch (action) {
    case "unlockWithSharedPassword":
      return unlockContributor(request, data);
    case "unlockAdminWithPassword":
      return unlockAdmin(data);
    case "createWeek":
      return createWeek(request, data);
    case "updateDepartments":
      return updateDepartments(request, data);
    case "saveEntry":
      return saveEntry(request, data);
    case "rebuildSearchIndex":
      await requireAdmin(request);
      return rebuildAllSearchIndexes();
  }
}

function parsedBody(request: ApiRequest): unknown {
  if (typeof request.body !== "string") return request.body;
  try {
    return JSON.parse(request.body);
  } catch {
    throw new ApiError(400, "invalid-json");
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ ok: false, error: "method-not-allowed" });
    return;
  }
  try {
    initializeFirebaseAdmin();
    const input = requestSchema.parse(parsedBody(request));
    const data = await executeAction(request, input.action, input.data);
    response.status(200).json({ ok: true, data });
  } catch (error) {
    if (error instanceof ApiError) {
      response.status(error.statusCode).json({ ok: false, error: error.code });
      return;
    }
    if (error instanceof z.ZodError) {
      response.status(400).json({ ok: false, error: "invalid-request" });
      return;
    }
    console.error("workspace-api-failed", error);
    response.status(500).json({ ok: false, error: "internal-error" });
  }
}
