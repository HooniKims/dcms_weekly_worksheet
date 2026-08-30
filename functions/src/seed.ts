import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { defaultDepartmentNames } from "./weeks.js";

initializeApp({ credential: applicationDefault(), projectId: "weekly-work-progress-2026" });

const db = getFirestore();
const batch = db.batch();

for (const [order, name] of defaultDepartmentNames.entries()) {
  const id = `department-${String(order + 1).padStart(2, "0")}`;
  batch.set(db.doc(`departments/${id}`), {
    name,
    order,
    active: true,
    omitWhenEmpty: order === 0,
  });
}

batch.set(db.doc("settings/site"), {
  serviceName: "주간업무추진사항",
  defaultMeetingTitle: "주간업무추진사항",
  timeZone: "Asia/Seoul",
  autoCreateNextWeek: false,
  updatedAt: FieldValue.serverTimestamp(),
});

batch.set(db.doc("weeks/2026-08-31"), {
  date: "2026-08-31",
  dateLabel: "2026년 8월 31일",
  meetingTitle: "주간업무추진사항",
  departmentSnapshot: defaultDepartmentNames.map((name, order) => ({
    id: `department-${String(order + 1).padStart(2, "0")}`,
    name,
    order,
    active: true,
    omitWhenEmpty: order === 0,
  })),
  createdBy: "admin",
  createdAt: FieldValue.serverTimestamp(),
});

await batch.commit();
process.stdout.write("firestore-seed-complete\n");
