import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Department } from "../domain/models";
import type { WeekId } from "../domain/week";
import { localRepository } from "./localRepository";

const storageKey = "weekly-work-progress-demo-v2";

function department(id: string, name: string, order: number, active = true): Department {
  return { id, name, order, active, omitWhenEmpty: false };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("migrated local history", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads every historical week and its selected entries", async () => {
    const oldest = await localRepository.load("2026-03-16");

    expect(oldest.weeks).toHaveLength(23);
    expect(oldest.weeks[0]?.id).toBe("2026-08-31");
    expect(oldest.weeks.at(-1)?.id).toBe("2026-03-16");
    expect(oldest.entries).toHaveLength(10);
    expect(oldest.entries.some((entry) => entry.plainText.includes("과학의 달"))).toBe(true);
  });

  it("keeps an existing empty date sheet visible", async () => {
    const emptyWeek = await localRepository.load("2026-05-25");

    expect(emptyWeek.weeks.some((week) => week.id === "2026-05-25")).toBe(true);
    expect(emptyWeek.entries).toEqual([]);
  });

  it("uses separate environment passwords for contributors and administrators", async () => {
    await expect(localRepository.unlock("test-site-password")).resolves.toBeUndefined();
    await expect(localRepository.unlock("test-admin-password")).rejects.toThrow("wrong-password");
    await expect(localRepository.signInAdmin("test-admin-password")).resolves.toBeUndefined();
    await expect(localRepository.signInAdmin("test-site-password")).rejects.toThrow(
      "wrong-admin-password",
    );
  });
});

describe("local workspace administration", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("Given a granted contributor session, when logging out, then restoring the session is false", async () => {
    await localRepository.unlock("test-site-password");

    await localRepository.logout();

    await expect(localRepository.restoreSession()).resolves.toBe(false);
  });

  it("Given a migrated week, when saving renamed reordered and added departments, then it preserves ids and soft-deletes omissions", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    const activeDepartments = [
      department("department-03", "교무운영팀", 42),
      department("department-new", "새로운부서", 99),
    ];

    const snapshot = await localRepository.saveDepartments(selectedWeekId, activeDepartments);

    expect(snapshot.departments).toEqual([
      department("department-03", "교무운영팀", 0),
      department("department-new", "새로운부서", 1),
    ]);
    expect(snapshot.weeks.find((week) => week.id === selectedWeekId)?.departmentSnapshot).toEqual(
      snapshot.departments,
    );
    const stored = localStorage.getItem(storageKey);
    expect(stored).toContain('"id":"department-01"');
    expect(stored).toContain('"active":false');
  });

  it("Given the prior persisted state shape without departments, when loading and saving departments, then it remains compatible", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    localStorage.setItem(storageKey, JSON.stringify({ weeks: [], entriesByWeek: {} }));

    const before = await localRepository.load(selectedWeekId);
    await localRepository.saveDepartments(selectedWeekId, [
      department("department-03", "교무운영팀", 0),
    ]);
    const after = await localRepository.load(selectedWeekId);

    expect(before.departments).toHaveLength(11);
    expect(after.departments).toEqual([department("department-03", "교무운영팀", 0)]);
  });

  it("Given a removed department with an entry, when saving current departments, then the entry remains available through the local load path", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    const before = await localRepository.load(selectedWeekId);
    const existing = before.entries.find((entry) => entry.departmentId === "department-01");
    expect(existing).toBeDefined();
    await localRepository.saveEntry({
      weekId: selectedWeekId,
      departmentId: "department-01",
      htmlContent: "<p>보존</p>",
      plainText: "보존할 업무",
      expectedVersion: existing?.version ?? 0,
    });

    await localRepository.saveDepartments(selectedWeekId, [
      department("department-03", "교무운영팀", 0),
    ]);

    const loaded = await localRepository.load(selectedWeekId);
    expect(loaded.entries.find((entry) => entry.departmentId === "department-01")?.plainText).toBe(
      "보존할 업무",
    );
    expect(localStorage.getItem(storageKey)).toContain("보존할 업무");
  });

  it("Given a migrated current week, when its departments are saved locally, then older migrated snapshots and migrated entries remain intact", async () => {
    const currentWeekId: WeekId = "2026-08-31";
    const olderWeekId: WeekId = "2026-08-24";
    const olderBefore = await localRepository.load(olderWeekId);

    await localRepository.saveDepartments(currentWeekId, [
      department("department-03", "교무운영팀", 0),
    ]);

    const current = await localRepository.load(currentWeekId);
    const olderAfter = await localRepository.load(olderWeekId);
    expect(current.entries).not.toEqual([]);
    expect(olderAfter.weeks.find((week) => week.id === olderWeekId)?.departmentSnapshot).toEqual(
      olderBefore.weeks.find((week) => week.id === olderWeekId)?.departmentSnapshot,
    );
  });

  it("Given a department removed from the selected week, when searching its Korean name, then only historical weeks remain searchable", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    const historicalWeekId: WeekId = "2026-08-24";
    await localRepository.saveDepartments(selectedWeekId, [
      department("department-03", "교무운영팀", 0),
    ]);

    const results = await localRepository.search("과학");

    expect(
      results.some(
        (result) => result.weekId === selectedWeekId && result.departmentId === "department-07",
      ),
    ).toBe(false);
    expect(
      results.some(
        (result) => result.weekId === historicalWeekId && result.departmentId === "department-07",
      ),
    ).toBe(true);
  });

  it("Given a migrated entry override, when searching old and new Korean content, then only the local content is returned for that week", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    const before = await localRepository.load(selectedWeekId);
    const existing = before.entries.find((entry) => entry.departmentId === "department-01");
    expect(existing).toBeDefined();
    await localRepository.saveEntry({
      weekId: selectedWeekId,
      departmentId: "department-01",
      htmlContent: "<p>대체 검색 본문</p>",
      plainText: "대체 검색 본문",
      expectedVersion: existing?.version ?? 0,
    });

    const localContent = await localRepository.search("대체");
    const migratedContent = await localRepository.search("여호와");

    expect(
      localContent.some(
        (result) => result.weekId === selectedWeekId && result.departmentId === "department-01",
      ),
    ).toBe(true);
    expect(
      migratedContent.some(
        (result) => result.weekId === selectedWeekId && result.departmentId === "department-01",
      ),
    ).toBe(false);
  });

  it("Given active master departments, when creating a later week, then only those active departments are inherited", async () => {
    const selectedWeekId: WeekId = "2026-08-31";
    const nextWeekId: WeekId = "2026-09-07";
    await localRepository.saveDepartments(selectedWeekId, [
      department("department-03", "교무운영팀", 1),
      department("department-new", "새로운부서", 7),
    ]);

    const created = await localRepository.createWeek(nextWeekId);

    expect(created.departmentSnapshot).toEqual([
      department("department-03", "교무운영팀", 0),
      department("department-new", "새로운부서", 1),
    ]);
  });

  it("Given merged migrated and local weeks, when searching Korean department names and content, then results have navigable ids and short queries are empty", async () => {
    const weekId: WeekId = "2026-09-07";
    await localRepository.saveDepartments("2026-08-31", [
      department("department-03", "교무운영팀", 0),
      department("department-new", "학생지원팀", 1),
      department("department-empty", "빈부서검색", 2),
    ]);
    await localRepository.createWeek(weekId);
    await localRepository.saveEntry({
      weekId,
      departmentId: "department-new",
      htmlContent: "<p>안전 점검</p>",
      plainText: "학생 안전 점검 계획",
      expectedVersion: 0,
    });

    const departmentResults = await localRepository.search("지원");
    const emptyDepartmentResults = await localRepository.search("검색");
    const contentResults = await localRepository.search("안전");
    const shortResults = await localRepository.search("안");

    expect(departmentResults).toContainEqual({
      weekId,
      dateLabel: "2026년 9월 7일",
      departmentId: "department-new",
      departmentName: "학생지원팀",
      excerpt: "학생 안전 점검 계획",
    });
    expect(departmentResults[0]?.weekId).toBe(weekId);
    expect(
      contentResults.some(
        (result) => result.weekId === weekId && result.departmentId === "department-new",
      ),
    ).toBe(true);
    expect(emptyDepartmentResults).toContainEqual({
      weekId,
      dateLabel: "2026년 9월 7일",
      departmentId: "department-empty",
      departmentName: "빈부서검색",
      excerpt: "빈부서검색",
    });
    expect(shortResults).toEqual([]);
  });

  it("Given more than fifty matching departments in the newest week, when searching, then results are capped at fifty newest-first items", async () => {
    const weekId: WeekId = "2026-09-07";
    const departments = Array.from({ length: 51 }, (_, order) =>
      department(`department-${String(order)}`, `검색부서${String(order)}`, order),
    );
    await localRepository.saveDepartments("2026-08-31", departments);
    await localRepository.createWeek(weekId);

    const results = await localRepository.search("검색");

    expect(results).toHaveLength(50);
    expect(results[0]?.weekId).toBe(weekId);
  });

  it("Given a local demo repository, when rebuilding its search index, then it resolves without changing searchable data", async () => {
    const before = await localRepository.search("과학");

    await expect(localRepository.rebuildSearchIndex()).resolves.toBeUndefined();

    await expect(localRepository.search("과학")).resolves.toEqual(before);
  });
});
