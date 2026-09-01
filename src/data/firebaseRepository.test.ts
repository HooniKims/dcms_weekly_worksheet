import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { defaultDepartments } from "../domain/models";
import type { WeekId } from "../domain/week";

type MockDocument = Readonly<{
  id: string;
  data: () => Readonly<Record<string, unknown>>;
}>;
type MockSnapshot = Readonly<{ empty: boolean; docs: readonly MockDocument[] }>;
type FirebaseMockState = {
  snapshots: MockSnapshot[];
  calls: { name: string; payload: unknown }[];
  responses: Record<string, unknown>;
  queryArguments: unknown[][];
  whereArguments: unknown[][];
  orderByArguments: { field: string; direction: string | undefined }[];
  limitArguments: number[];
  startAfterArguments: unknown[][];
};

const firebaseState = vi.hoisted(
  (): FirebaseMockState => ({
    snapshots: [],
    calls: [],
    responses: {},
    queryArguments: [],
    whereArguments: [],
    orderByArguments: [],
    limitArguments: [],
    startAfterArguments: [],
  }),
);
const signOut = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn(async () => undefined), signOut }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...segments: string[]) => segments),
  doc: vi.fn((...segments: string[]) => segments),
  getDocs: vi.fn(async () => firebaseState.snapshots.shift() ?? emptySnapshot()),
  limit: vi.fn((value: number) => {
    firebaseState.limitArguments.push(value);
    return { kind: "limit", value };
  }),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, direction?: string) => {
    firebaseState.orderByArguments.push({ field, direction });
    return { kind: "orderBy", field, direction };
  }),
  query: vi.fn((...arguments_: unknown[]) => {
    firebaseState.queryArguments.push(arguments_);
    return arguments_;
  }),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn((...arguments_: unknown[]) => {
    firebaseState.startAfterArguments.push(arguments_);
    return { kind: "startAfter", arguments_ };
  }),
  where: vi.fn((...arguments_: unknown[]) => {
    firebaseState.whereArguments.push(arguments_);
    return { kind: "where", arguments_ };
  }),
}));
vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => async (payload: unknown) => {
    firebaseState.calls.push({ name, payload });
    return { data: firebaseState.responses[name] };
  }),
}));
vi.mock("./firebaseClient", () => ({ auth: {}, cloudFunctions: {}, db: {} }));

import { CreatedWeekUnavailableError, firebaseRepository } from "./firebaseRepository";

function emptySnapshot(): MockSnapshot {
  return { empty: true, docs: [] };
}
function snapshot(...docs: readonly MockDocument[]): MockSnapshot {
  return { empty: docs.length === 0, docs };
}
function document(id: string, data: Readonly<Record<string, unknown>>): MockDocument {
  return { id, data: () => data };
}
function weekDocument(
  id: WeekId,
  departmentSnapshot: readonly Readonly<Record<string, unknown>>[],
): MockDocument {
  return document(id, {
    date: id,
    dateLabel: "2026년 9월 7일",
    meetingTitle: "주간업무추진사항",
    createdBy: "admin",
    createdAt: "2026-09-07T00:00:00.000Z",
    departmentSnapshot,
  });
}
function departmentDocument(id: string, name: string, order: number, active = true): MockDocument {
  return document(id, { name, order, active, omitWhenEmpty: false });
}
function indexDocument(
  id: string,
  values: Readonly<{
    weekId?: WeekId;
    departmentId?: string;
    departmentName?: string;
    plainText?: string;
    normalizedText?: string;
    grams?: readonly string[];
    updatedAt?: unknown;
  }> = {},
): MockDocument {
  const weekId = values.weekId ?? "2026-09-07";
  const departmentId = values.departmentId ?? "department-01";
  const departmentName = values.departmentName ?? "생활안전부";
  const plainText = values.plainText ?? "학생 안전 점검 계획";
  const normalizedText = values.normalizedText ?? `${departmentName} ${plainText}`.toLowerCase();
  return document(id, {
    weekId,
    dateLabel: "2026년 9월 7일",
    departmentId,
    departmentName,
    plainText,
    normalizedText,
    grams: values.grams ?? ["안전"],
    updatedAt: values.updatedAt ?? { toDate: () => new Date("2026-09-07T00:00:00.000Z") },
  });
}
function queueLoad(week: MockDocument, departments: readonly MockDocument[]): void {
  firebaseState.snapshots.push(snapshot(week), snapshot(...departments), emptySnapshot());
}

describe("firebaseRepository", () => {
  beforeEach(() => {
    firebaseState.snapshots.splice(0);
    firebaseState.calls.splice(0);
    firebaseState.queryArguments.splice(0);
    firebaseState.whereArguments.splice(0);
    firebaseState.orderByArguments.splice(0);
    firebaseState.limitArguments.splice(0);
    firebaseState.startAfterArguments.splice(0);
    firebaseState.responses = {};
    signOut.mockClear();
  });

  it("Given an authenticated Firebase client, when logging out, then Firebase Auth signs out", async () => {
    await firebaseRepository.logout();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("Given ordered departments, when saving them, then the callable receives the selected week and reloads it", async () => {
    const weekId: WeekId = "2026-09-07";
    firebaseState.responses.updateDepartments = { updated: 1, indexStatus: "fresh" };
    const saved = departmentDocument("department-02", "교무기획부", 0);
    queueLoad(
      weekDocument(weekId, [
        { id: "department-02", name: "교무기획부", order: 0, active: true, omitWhenEmpty: false },
      ]),
      [saved, departmentDocument("department-old", "비활성", 1, false)],
    );
    const after = await firebaseRepository.saveDepartments(weekId, [
      { id: "department-02", name: "교무기획부", order: 9, active: true, omitWhenEmpty: false },
    ]);
    expect(firebaseState.calls).toContainEqual({
      name: "updateDepartments",
      payload: {
        weekId,
        departments: [
          { id: "department-02", name: "교무기획부", order: 9, active: true, omitWhenEmpty: false },
        ],
      },
    });
    expect(after.departments).toEqual([
      { id: "department-02", name: "교무기획부", order: 0, active: true, omitWhenEmpty: false },
    ]);
    expect(after.weeks[0]?.departmentSnapshot).toEqual([
      { id: "department-02", name: "교무기획부", order: 0, active: true, omitWhenEmpty: false },
    ]);
  });

  it("Given a malformed department response, when saving departments, then the boundary rejects it", async () => {
    firebaseState.responses.updateDepartments = { updated: 1, indexStatus: "unknown" };
    await expect(firebaseRepository.saveDepartments("2026-09-07", [])).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("Given inactive master documents and a historical snapshot, when loading, then only the master list is filtered", async () => {
    const preserved = {
      id: "department-old",
      name: "예전부서",
      order: 1,
      active: false,
      omitWhenEmpty: false,
    };
    queueLoad(weekDocument("2026-09-07", [preserved]), [
      departmentDocument("department-now", "현재부서", 0),
      departmentDocument("department-old", "예전부서", 1, false),
    ]);
    const loaded = await firebaseRepository.load("2026-09-07");
    expect(loaded.departments).toEqual([
      { id: "department-now", name: "현재부서", order: 0, active: true, omitWhenEmpty: false },
    ]);
    expect(loaded.weeks[0]?.departmentSnapshot).toEqual([preserved]);
  });

  it("Given an empty master collection, when loading, then fallback default departments remain available", async () => {
    queueLoad(weekDocument("2026-09-07", []), []);

    const loaded = await firebaseRepository.load("2026-09-07");

    expect(loaded.departments).toEqual(defaultDepartments);
  });

  it("Given a week document with an unknown field, when loading, then the raw document boundary rejects it", async () => {
    firebaseState.snapshots.push(
      snapshot(
        document("2026-09-07", {
          date: "2026-09-07",
          dateLabel: "2026년 9월 7일",
          meetingTitle: "주간업무추진사항",
          createdBy: "admin",
          createdAt: "2026-09-07T00:00:00.000Z",
          departmentSnapshot: [],
          unexpected: true,
        }),
      ),
      emptySnapshot(),
    );

    await expect(firebaseRepository.load("2026-09-07")).rejects.toThrow();
  });

  it("Given a master department document with an unknown field, when loading, then the raw document boundary rejects it", async () => {
    queueLoad(weekDocument("2026-09-07", []), [
      document("department-01", {
        name: "교무기획부",
        order: 0,
        active: true,
        omitWhenEmpty: false,
        unexpected: true,
      }),
    ]);

    await expect(firebaseRepository.load("2026-09-07")).rejects.toThrow();
  });

  it("Given an entry document with an unknown field, when loading, then the raw document boundary rejects it", async () => {
    firebaseState.snapshots.push(
      snapshot(weekDocument("2026-09-07", [])),
      emptySnapshot(),
      snapshot(
        document("department-01", {
          departmentId: "department-01",
          htmlContent: "<p>내용</p>",
          plainText: "내용",
          version: 1,
          updatedAt: "2026-09-07T00:00:00.000Z",
          updatedByRole: "contributor",
          unexpected: true,
        }),
      ),
    );

    await expect(firebaseRepository.load("2026-09-07")).rejects.toThrow();
  });

  it("Given a persisted entry includes its department id, when loading, then the workspace accepts it", async () => {
    // Given
    firebaseState.snapshots.push(
      snapshot(weekDocument("2026-09-07", [])),
      emptySnapshot(),
      snapshot(
        document("department-01", {
          departmentId: "department-01",
          htmlContent: "<p>내용</p>",
          plainText: "내용",
          version: 1,
          updatedAt: "2026-09-07T00:00:00.000Z",
          updatedByRole: "contributor",
        }),
      ),
    );

    // When
    const loaded = await firebaseRepository.load("2026-09-07");

    // Then
    expect(loaded.entries).toEqual([
      {
        departmentId: "department-01",
        htmlContent: "<p>내용</p>",
        plainText: "내용",
        version: 1,
        updatedAt: "2026-09-07T00:00:00.000Z",
        updatedByRole: "contributor",
      },
    ]);
  });

  it("Given an invalid timestamp string, when loading, then the timestamp boundary rejects it", async () => {
    firebaseState.snapshots.push(
      snapshot(
        document("2026-09-07", {
          date: "2026-09-07",
          dateLabel: "2026년 9월 7일",
          meetingTitle: "주간업무추진사항",
          createdBy: "admin",
          createdAt: "not-a-date",
          departmentSnapshot: [],
        }),
      ),
      emptySnapshot(),
    );

    await expect(firebaseRepository.load("2026-09-07")).rejects.toThrow();
  });

  it("Given a rebuild response, when rebuilding the search index, then its counts are strictly parsed", async () => {
    firebaseState.responses.rebuildSearchIndex = { indexed: 4, deleted: 1 };
    await expect(firebaseRepository.rebuildSearchIndex()).resolves.toBeUndefined();
    expect(firebaseState.calls).toContainEqual({ name: "rebuildSearchIndex", payload: undefined });
  });

  it("Given a malformed rebuild response, when rebuilding the search index, then the callable boundary rejects it", async () => {
    firebaseState.responses.rebuildSearchIndex = { indexed: -1, deleted: 1 };

    await expect(firebaseRepository.rebuildSearchIndex()).rejects.toBeInstanceOf(ZodError);
  });

  it("Given a short search query, when searching, then no archive candidate read occurs", async () => {
    await expect(firebaseRepository.search("안")).resolves.toEqual([]);
    expect(firebaseState.queryArguments).toEqual([]);
  });

  it("Given gram candidates, when searching, then Firestore narrows them and exact matching removes false positives", async () => {
    firebaseState.snapshots.push(
      snapshot(
        indexDocument("match", { departmentId: "department-match", plainText: "학생 안전 점검" }),
        indexDocument("false", {
          departmentId: "department-false",
          departmentName: "가짜부서",
          plainText: "안 전 사이에 공백",
          normalizedText: "가짜부서 안 전 사이에 공백",
        }),
      ),
    );
    const results = await firebaseRepository.search("안전");
    expect(firebaseState.whereArguments).toContainEqual(["grams", "array-contains", "안전"]);
    expect(firebaseState.orderByArguments).toContainEqual({ field: "weekId", direction: "desc" });
    expect(firebaseState.orderByArguments).toContainEqual({
      field: "departmentId",
      direction: "asc",
    });
    expect(firebaseState.limitArguments).toContain(200);
    expect(results).toEqual([
      {
        weekId: "2026-09-07",
        dateLabel: "2026년 9월 7일",
        departmentId: "department-match",
        departmentName: "생활안전부",
        excerpt: "학생 안전 점검",
      },
    ]);
  });

  it("Given more than one page of newer false gram candidates, when older exact matches exist, then search paginates to the globally ordered exact cap", async () => {
    const newerFalseCandidates = Array.from({ length: 200 }, (_, index) =>
      indexDocument(`false-${String(index)}`, {
        weekId: "2026-09-14",
        departmentId: `false-${String(index).padStart(3, "0")}`,
        departmentName: "가짜부서",
        plainText: "안 전",
        normalizedText: "가짜부서 안 전",
        grams: ["검색"],
      }),
    );
    const olderExactMatches = Array.from({ length: 51 }, (_, index) =>
      indexDocument(`older-${String(index)}`, {
        weekId: "2026-09-07",
        departmentId: `older-${String(index).padStart(3, "0")}`,
        departmentName: `정확부서${String(index + 1).padStart(2, "0")}`,
        plainText: "검색 결과",
        normalizedText: `정확부서${String(index + 1).padStart(2, "0")} 검색 결과`,
      }),
    );
    const finalNewerFalseCandidate = indexDocument("false-200", {
      weekId: "2026-09-14",
      departmentId: "false-200",
      departmentName: "가짜부서",
      plainText: "안 전",
      normalizedText: "가짜부서 안 전",
      grams: ["검색"],
    });
    firebaseState.snapshots.push(
      snapshot(...newerFalseCandidates),
      snapshot(finalNewerFalseCandidate, ...olderExactMatches),
    );

    const results = await firebaseRepository.search("검색");

    expect(firebaseState.startAfterArguments).toContainEqual([newerFalseCandidates[199]]);
    expect(results).toHaveLength(50);
    expect(results.every((result) => result.weekId === "2026-09-07")).toBe(true);
    expect(results[0]).toEqual({
      weekId: "2026-09-07",
      dateLabel: "2026년 9월 7일",
      departmentId: "older-000",
      departmentName: "정확부서01",
      excerpt: "검색 결과",
    });
  });

  it("Given more than fifty matches across weeks, when searching, then newest-week results sort before the cap", async () => {
    const olderDocs = Array.from({ length: 50 }, (_, index) =>
      indexDocument(`index-${String(index)}`, {
        weekId: "2026-09-07",
        departmentId: `department-${String(index).padStart(2, "0")}`,
        departmentName: `검색부서${String(51 - index).padStart(2, "0")}`,
        plainText: index === 0 ? "검색 결과 내용" : "",
        normalizedText: `검색부서${String(51 - index).padStart(2, "0")} 검색 결과 내용`,
      }),
    );
    const newest = indexDocument("index-newest", {
      weekId: "2026-09-14",
      departmentId: "department-newest",
      departmentName: "검색신규",
      plainText: "검색 최신 내용",
      normalizedText: "검색신규 검색 최신 내용",
    });
    firebaseState.snapshots.push(snapshot(newest, ...olderDocs));
    const results = await firebaseRepository.search("검색");
    expect(results).toHaveLength(50);
    expect(results[0]).toEqual({
      weekId: "2026-09-14",
      dateLabel: "2026년 9월 7일",
      departmentId: "department-newest",
      departmentName: "검색신규",
      excerpt: "검색 최신 내용",
    });
    expect(results[1]).toEqual({
      weekId: "2026-09-07",
      dateLabel: "2026년 9월 7일",
      departmentId: "department-00",
      departmentName: "검색부서51",
      excerpt: "검색 결과 내용",
    });
  });

  it("Given a malformed search index record, when searching, then the boundary error surfaces", async () => {
    firebaseState.snapshots.push(snapshot(document("bad", { weekId: "2026-09-07" })));
    await expect(firebaseRepository.search("안전")).rejects.toThrow();
  });

  it("Given a timestamp whose toDate result is invalid, when searching, then the timestamp boundary rejects it", async () => {
    firebaseState.snapshots.push(
      snapshot(
        indexDocument("bad-timestamp", { updatedAt: { toDate: () => new Date("invalid") } }),
      ),
    );

    await expect(firebaseRepository.search("안전")).rejects.toThrow();
  });

  it("Given a successful creation and a reloaded week, when creating, then the populated snapshot is returned", async () => {
    const weekId: WeekId = "2026-09-14";
    firebaseState.responses.createWeek = { created: true };
    const inherited = departmentDocument("department-03", "교육연구부", 0);
    queueLoad(
      weekDocument(weekId, [
        { id: "department-03", name: "교육연구부", order: 0, active: true, omitWhenEmpty: false },
      ]),
      [inherited],
    );
    const created = await firebaseRepository.createWeek(weekId);
    expect(firebaseState.calls).toContainEqual({ name: "createWeek", payload: { weekId } });
    expect(created.departmentSnapshot).toEqual([
      { id: "department-03", name: "교육연구부", order: 0, active: true, omitWhenEmpty: false },
    ]);
  });

  it("Given a malformed create-week response, when creating, then the callable boundary rejects it", async () => {
    firebaseState.responses.createWeek = { created: "yes" };

    await expect(firebaseRepository.createWeek("2026-09-14")).rejects.toBeInstanceOf(ZodError);
  });

  it("Given a callable that reports success without a reloaded week, when creating, then a typed domain error is thrown", async () => {
    firebaseState.responses.createWeek = { created: true };
    firebaseState.snapshots.push(emptySnapshot(), emptySnapshot());
    await expect(firebaseRepository.createWeek("2026-09-14")).rejects.toBeInstanceOf(
      CreatedWeekUnavailableError,
    );
  });

  it("Given active and archived week documents, when loading an archived id, then only active weeks are selectable", async () => {
    // Given
    const active = weekDocument("2026-09-07", []);
    const archived = document("2026-08-31", {
      date: "2026-08-31",
      dateLabel: "2026년 8월 31일",
      meetingTitle: "주간업무추진사항",
      createdBy: "admin",
      createdAt: "2026-08-31T00:00:00.000Z",
      archivedAt: "2026-09-01T00:00:00.000Z",
      departmentSnapshot: [],
    });
    firebaseState.snapshots.push(snapshot(active, archived), emptySnapshot(), emptySnapshot());

    // When
    const loaded = await firebaseRepository.load("2026-08-31");

    // Then
    expect(loaded.weeks.map((week) => week.id)).toEqual(["2026-09-07"]);
    expect(loaded.archivedWeeks.map((week) => week.id)).toEqual(["2026-08-31"]);
  });

  it("Given an active week, when archiving it, then the backend action is called and the remaining workspace is returned", async () => {
    // Given
    const weekId: WeekId = "2026-08-31";
    firebaseState.responses.archiveWeek = { status: "archived" };
    queueLoad(weekDocument("2026-09-07", []), []);

    // When
    const loaded = await firebaseRepository.archiveWeek(weekId);

    // Then
    expect(firebaseState.calls).toContainEqual({ name: "archiveWeek", payload: { weekId } });
    expect(loaded.weeks[0]?.id).toBe("2026-09-07");
  });

  it("Given an archived week, when restoring it, then the backend action is called and that week reloads", async () => {
    // Given
    const weekId: WeekId = "2026-08-31";
    firebaseState.responses.restoreWeek = { status: "restored" };
    queueLoad(weekDocument(weekId, []), []);

    // When
    const loaded = await firebaseRepository.restoreWeek(weekId);

    // Then
    expect(firebaseState.calls).toContainEqual({ name: "restoreWeek", payload: { weekId } });
    expect(loaded.weeks[0]?.id).toBe(weekId);
  });
});
