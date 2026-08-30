import { defaultDepartmentNames } from "./weeks.js";

const token = process.env.FIRESTORE_ACCESS_TOKEN;
if (token === undefined || token.length === 0) throw new Error("firestore-access-token-required");

const projectId = "weekly-work-progress-2026";
const documentRoot = `projects/${projectId}/databases/(default)/documents`;

type FirestoreValue =
  | Readonly<{ stringValue: string }>
  | Readonly<{ integerValue: string }>
  | Readonly<{ booleanValue: boolean }>
  | Readonly<{ arrayValue: Readonly<{ values: readonly FirestoreValue[] }> }>
  | Readonly<{ mapValue: Readonly<{ fields: Readonly<Record<string, FirestoreValue>> }> }>;

type Write = { update: { name: string; fields: Record<string, FirestoreValue> } };

function stringValue(value: string): FirestoreValue {
  return { stringValue: value };
}

function mapValue(fields: Readonly<Record<string, FirestoreValue>>): FirestoreValue {
  return { mapValue: { fields } };
}

const writes: Write[] = defaultDepartmentNames.map((name, order) => ({
  update: {
    name: `${documentRoot}/departments/department-${String(order + 1).padStart(2, "0")}`,
    fields: {
      name: stringValue(name),
      order: { integerValue: String(order) },
      active: { booleanValue: true },
      omitWhenEmpty: { booleanValue: order === 0 },
    },
  },
}));

writes.push({
  update: {
    name: `${documentRoot}/settings/site`,
    fields: {
      serviceName: stringValue("주간업무추진사항"),
      defaultMeetingTitle: stringValue("주간업무추진사항"),
      timeZone: stringValue("Asia/Seoul"),
      autoCreateNextWeek: { booleanValue: false },
      updatedAt: stringValue(new Date().toISOString()),
    },
  },
});

writes.push({
  update: {
    name: `${documentRoot}/weeks/2026-08-31`,
    fields: {
      date: stringValue("2026-08-31"),
      dateLabel: stringValue("2026년 8월 31일"),
      meetingTitle: stringValue("주간업무추진사항"),
      createdBy: stringValue("admin"),
      createdAt: stringValue(new Date().toISOString()),
      departmentSnapshot: {
        arrayValue: {
          values: defaultDepartmentNames.map((name, order) =>
            mapValue({
              id: stringValue(`department-${String(order + 1).padStart(2, "0")}`),
              name: stringValue(name),
              order: { integerValue: String(order) },
              active: { booleanValue: true },
              omitWhenEmpty: { booleanValue: order === 0 },
            }),
          ),
        },
      },
    },
  },
});

const response = await fetch(`https://firestore.googleapis.com/v1/${documentRoot}:batchWrite`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-goog-user-project": projectId,
  },
  body: JSON.stringify({ writes }),
});

if (!response.ok) throw new Error(`firestore-seed-${response.status}:${await response.text()}`);
process.stdout.write(`firestore-seed-complete:${writes.length}\n`);
