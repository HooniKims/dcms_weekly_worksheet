import { mkdir, readFile, writeFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const spreadsheetId = "1eQFBttdX8AijXCbmHIQzHypFjiEoE0G4jMRM4ymVSBM";
const projectId = "weekly-work-progress-2026";
const rawSheetName = "제출원본";
const outputDirectory = new URL("../src/data/migrated/", import.meta.url);
const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
const writeToFirestore = process.argv.includes("--write");
const inputArgumentIndex = process.argv.indexOf("--input");
const inputPath = inputArgumentIndex < 0 ? undefined : process.argv[inputArgumentIndex + 1];

if (
  (inputPath === undefined || writeToFirestore) &&
  (accessToken === undefined || accessToken.length === 0)
) {
  throw new Error("GOOGLE_ACCESS_TOKEN is required");
}

const departments = [
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

const expectedHeaders = [
  "기준시트",
  "기준일자",
  "부서",
  "내용HTML",
  "내용구조JSON",
  "내용텍스트",
  "최종수정시각",
];

const allowedTags = new Set([
  "A",
  "B",
  "BR",
  "DIV",
  "EM",
  "I",
  "LI",
  "OL",
  "P",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
]);
const allowedAttributes = new Set(["colspan", "rowspan"]);

function cleanElement(element) {
  for (const child of Array.from(element.children)) {
    if (!allowedTags.has(child.tagName)) {
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") {
        child.remove();
      } else {
        child.replaceWith(...Array.from(child.childNodes));
      }
      continue;
    }
    for (const attribute of Array.from(child.attributes)) {
      const name = attribute.name.toLowerCase();
      if (child.tagName === "A" && name === "href") {
        if (!/^(https?:|mailto:)/i.test(attribute.value.trim())) {
          child.removeAttribute(attribute.name);
        }
      } else if (!allowedAttributes.has(name)) {
        child.removeAttribute(attribute.name);
      }
    }
    if (child.tagName === "A" && child.hasAttribute("href")) {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
    cleanElement(child);
  }
}

function sanitizeHtml(html) {
  const dom = new JSDOM(`<div id="migration-root">${html}</div>`);
  const root = dom.window.document.getElementById("migration-root");
  if (root === null) return "";
  cleanElement(root);
  for (const element of Array.from(root.querySelectorAll("div"))) {
    if ((element.textContent ?? "").trim() === "" && element.children.length === 0)
      element.remove();
  }
  return root.innerHTML.trim();
}

function normalizeTimestamp(value, fallbackDate) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2}):(\d{2})$/);
  if (match === null) return `${fallbackDate}T00:00:00+09:00`;
  return `${match[1]}-${match[2]}-${match[3]}T${String(match[4]).padStart(2, "0")}:${match[5]}:${match[6]}+09:00`;
}

function koreanDateLabel(weekId) {
  const [year, month, day] = weekId.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function normalizeWeekId(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match === null) throw new Error(`invalid-week:${String(value ?? "")}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function departmentSnapshot() {
  return departments.map((name, order) => ({
    id: `department-${String(order + 1).padStart(2, "0")}`,
    name,
    order,
    active: true,
    omitWhenEmpty: false,
  }));
}

async function googleSheets(path) {
  if (accessToken === undefined) throw new Error("GOOGLE_ACCESS_TOKEN is required");
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) throw new Error(`sheets-${response.status}:${await response.text()}`);
  return response.json();
}

function fieldValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) {
    return { integerValue: String(value) };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(fieldValue) } };
  }
  if (typeof value === "object" && value !== null) {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, fieldValue(item)]),
        ),
      },
    };
  }
  throw new Error("unsupported-firestore-value");
}

function firestoreWrite(path, value) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, fieldValue(item)]),
      ),
    },
  };
}

function chunkWrites(writes) {
  const chunks = [];
  let current = [];
  let currentBytes = 0;
  for (const write of writes) {
    const bytes = Buffer.byteLength(JSON.stringify(write));
    if (bytes > 900_000) throw new Error(`firestore-document-too-large:${write.update.name}`);
    if (current.length >= 100 || currentBytes + bytes > 3_500_000) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(write);
    currentBytes += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function commitWrites(writes) {
  let committed = 0;
  for (const chunk of chunkWrites(writes)) {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-goog-user-project": projectId,
        },
        body: JSON.stringify({ writes: chunk }),
      },
    );
    if (!response.ok) throw new Error(`firestore-${response.status}:${await response.text()}`);
    const result = await response.json();
    if (!Array.isArray(result.writeResults) || result.writeResults.length !== chunk.length) {
      throw new Error("firestore-write-count-mismatch");
    }
    committed += chunk.length;
  }
  return committed;
}

const source =
  inputPath === undefined
    ? await Promise.all([
        googleSheets("?fields=sheets.properties"),
        googleSheets(
          `/values/${encodeURIComponent(`${rawSheetName}!A1:G1000`)}?valueRenderOption=FORMATTED_VALUE`,
        ),
      ]).then(([metadata, rawData]) => ({
        sheetTitles: metadata.sheets.map((sheet) => String(sheet.properties?.title ?? "")),
        values: rawData.values ?? [],
      }))
    : JSON.parse(await readFile(inputPath, "utf8"));

const weekIds = source.sheetTitles
  .map((title) => String(title))
  .filter((title) => /^\d{4}-\d{2}-\d{2}$/.test(title))
  .sort()
  .reverse();
const values = source.values ?? [];
const headers = values[0] ?? [];
if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
  throw new Error(`unexpected-headers:${JSON.stringify(headers)}`);
}

const departmentIds = new Map(
  departments.map((name, order) => [name, `department-${String(order + 1).padStart(2, "0")}`]),
);
const entriesByWeek = new Map(weekIds.map((weekId) => [weekId, []]));
const seen = new Set();
const failures = [];

for (const [offset, valuesRow] of values.slice(1).entries()) {
  const rowNumber = offset + 2;
  try {
    const row = Object.fromEntries(
      expectedHeaders.map((header, index) => [header, valuesRow[index] ?? ""]),
    );
    const weekId = normalizeWeekId(row["기준시트"]);
    const departmentName = String(row["부서"]).trim();
    const departmentId = departmentIds.get(departmentName);
    if (!entriesByWeek.has(weekId)) throw new Error(`unknown-week:${weekId}`);
    if (departmentId === undefined) throw new Error(`unknown-department:${departmentName}`);
    const key = `${weekId}/${departmentId}`;
    if (seen.has(key)) throw new Error(`duplicate-entry:${key}`);
    JSON.parse(String(row["내용구조JSON"] || "[]"));
    seen.add(key);
    entriesByWeek.get(weekId).push({
      departmentId,
      htmlContent: sanitizeHtml(String(row["내용HTML"] ?? "")),
      plainText: String(row["내용텍스트"] ?? "").trim(),
      version: 1,
      updatedAt: normalizeTimestamp(row["최종수정시각"], weekId),
      updatedByRole: "migration",
    });
  } catch (error) {
    failures.push({
      row: rowNumber,
      error: error instanceof Error ? error.message : "unknown-error",
    });
  }
}

if (failures.length > 0) {
  throw new Error(`migration-validation-failed:${JSON.stringify(failures)}`);
}

const weeks = weekIds.map((weekId) => ({
  id: weekId,
  dateLabel: koreanDateLabel(weekId),
  meetingTitle: "주간업무추진사항",
  createdBy: "migration",
  createdAt: `${weekId}T00:00:00+09:00`,
  departmentSnapshot: departmentSnapshot(),
}));

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  new URL("index.json", outputDirectory),
  `${JSON.stringify({ sourceSpreadsheetId: spreadsheetId, weeks }, null, 2)}\n`,
);
for (const week of weeks) {
  await writeFile(
    new URL(`${week.id}.json`, outputDirectory),
    `${JSON.stringify(entriesByWeek.get(week.id) ?? [], null, 2)}\n`,
  );
}

const writes = [
  ...weeks.map((week) =>
    firestoreWrite(`weeks/${week.id}`, {
      date: week.id,
      dateLabel: week.dateLabel,
      meetingTitle: week.meetingTitle,
      departmentSnapshot: week.departmentSnapshot,
      createdBy: week.createdBy,
      createdAt: week.createdAt,
    }),
  ),
  ...weeks.flatMap((week) =>
    (entriesByWeek.get(week.id) ?? []).map((entry) =>
      firestoreWrite(`weeks/${week.id}/entries/${entry.departmentId}`, entry),
    ),
  ),
];

const committed = writeToFirestore ? await commitWrites(writes) : 0;
process.stdout.write(
  `${JSON.stringify({
    mode: writeToFirestore ? "write" : "dry-run",
    weeks: weeks.length,
    entries: seen.size,
    emptyWeeks: weeks
      .filter((week) => (entriesByWeek.get(week.id) ?? []).length === 0)
      .map((week) => week.id),
    writes: writes.length,
    committed,
    failures: failures.length,
  })}\n`,
);
