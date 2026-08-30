import { readFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { defaultDepartmentNames } from "./weeks.js";

const rowSchema = z.object({
  기준시트: z.string(),
  기준일자: z.string(),
  부서: z.string(),
  내용HTML: z.string().default(""),
  내용구조JSON: z.string().default(""),
  내용텍스트: z.string().default(""),
  최종수정시각: z.string().default(""),
});

const inputPath = process.argv[2];
if (inputPath === undefined) throw new Error("migration-json-path-required");

const rows = z.array(rowSchema).parse(JSON.parse(await readFile(inputPath, "utf8")));
initializeApp({ credential: applicationDefault(), projectId: "weekly-work-progress-2026" });
const db = getFirestore();

function normalizeDate(value: string): string {
  const parts = value.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (parts === null) throw new Error(`invalid-date:${value}`);
  return `${parts[1]}-${String(parts[2]).padStart(2, "0")}-${String(parts[3]).padStart(2, "0")}`;
}

const departmentIds = new Map<string, string>(
  defaultDepartmentNames.map((name, order) => [
    name,
    `department-${String(order + 1).padStart(2, "0")}`,
  ]),
);
const failures: string[] = [];

for (const row of rows) {
  try {
    const weekId = normalizeDate(row.기준일자);
    const departmentId = departmentIds.get(row.부서);
    if (departmentId === undefined) throw new Error(`unknown-department:${row.부서}`);
    const weekRef = db.doc(`weeks/${weekId}`);
    const entryRef = weekRef.collection("entries").doc(departmentId);
    const batch = db.batch();
    batch.set(
      weekRef,
      {
        date: weekId,
        dateLabel: `${weekId.slice(0, 4)}년 ${Number(weekId.slice(5, 7))}월 ${Number(weekId.slice(8, 10))}일`,
        meetingTitle: row.기준시트 || "주간업무추진사항",
        departmentSnapshot: defaultDepartmentNames.map((name, order) => ({
          id: `department-${String(order + 1).padStart(2, "0")}`,
          name,
          order,
          active: true,
          omitWhenEmpty: order === 0,
        })),
        createdBy: "migration",
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    batch.set(entryRef, {
      departmentId,
      htmlContent: row.내용HTML,
      plainText: row.내용텍스트,
      version: 1,
      updatedAt: row.최종수정시각 || new Date().toISOString(),
      updatedByRole: "migration",
    });
    await batch.commit();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "unknown-row-error");
  }
}

process.stdout.write(
  JSON.stringify(
    { migrated: rows.length - failures.length, failed: failures.length, failures },
    null,
    2,
  ),
);
