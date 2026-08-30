import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const iterations = 210_000;
const keyLength = 32;

export type PasswordRecord = Readonly<{
  hash: string;
  salt: string;
  sessionVersion: number;
}>;

export type PasswordMaterializationPlan = Readonly<{
  shouldCreate: boolean;
  record: PasswordRecord;
}>;

export function planPasswordMaterialization(
  existing: PasswordRecord | null,
  initial: PasswordRecord,
): PasswordMaterializationPlan {
  return existing === null
    ? { shouldCreate: true, record: initial }
    : { shouldCreate: false, record: existing };
}

type SessionClaims = Readonly<{
  admin?: unknown;
  role?: unknown;
  sessionVersion?: unknown;
}>;

export function contributorSessionAllowed(
  claims: SessionClaims,
  canonicalSessionVersion: number,
): boolean {
  if (claims.admin === true) return true;
  return claims.role === "contributor" && claims.sessionVersion === canonicalSessionVersion;
}

export function hashPassword(password: string, sessionVersion: number): PasswordRecord {
  const salt = randomBytes(16).toString("hex");
  const hash = derive(password, salt).toString("hex");
  return { hash, salt, sessionVersion };
}

export function verifyPassword(password: string, record: PasswordRecord): boolean {
  const expected = Buffer.from(record.hash, "hex");
  const actual = derive(password, record.salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function derive(password: string, salt: string): Buffer {
  return pbkdf2Sync(password, salt, iterations, keyLength, "sha256");
}
