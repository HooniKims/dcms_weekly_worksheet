import { useEffect, useRef, useState } from "react";
import type { WorkspaceRepository, WorkspaceSnapshot } from "../data/repository";
import { appendEditorHtml, htmlToPlainText, sanitizeEditorHtml } from "../domain/content";
import type { Department, DepartmentSnapshot, Entry, Week } from "../domain/models";
import type { WeekId } from "../domain/week";
import type { SaveState } from "./WorkspaceContent";
import { createWeekTrashActions } from "./weekTrashActions";

function activeSnapshotDepartments(week: Week | undefined): readonly DepartmentSnapshot[] {
  return [...(week?.departmentSnapshot ?? [])]
    .filter((department) => department.active)
    .sort((left, right) => left.order - right.order);
}

export function useWorkspaceController(
  repository: WorkspaceRepository,
  initialData: WorkspaceSnapshot,
) {
  const [snapshot, setSnapshot] = useState(initialData);
  const [weekId, setWeekId] = useState<WeekId>(initialData.weeks[0]?.id ?? "2026-08-31");
  const [departmentId, setDepartmentId] = useState(
    initialData.weeks[0]?.departmentSnapshot.find((department) => department.active)?.id ?? "",
  );
  const [draft, setDraft] = useState(() => {
    const firstDepartmentId = initialData.weeks[0]?.departmentSnapshot.find(
      (department) => department.active,
    )?.id;
    return (
      initialData.entries.find((entry) => entry.departmentId === firstDepartmentId)?.htmlContent ??
      ""
    );
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const selectionGeneration = useRef(0);
  const weekLoadGeneration = useRef(0);
  const createWeekGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const selection = useRef({ weekId, departmentId });

  const selectedWeek = snapshot.weeks.find((week) => week.id === weekId) ?? snapshot.weeks[0];
  const weekDepartments = activeSnapshotDepartments(selectedWeek);
  const selectedDepartment = weekDepartments.find((department) => department.id === departmentId);
  const selectedEntry = snapshot.entries.find((entry) => entry.departmentId === departmentId);

  useEffect(
    () =>
      repository.subscribeToWeek(weekId, (entries) => {
        setSnapshot((current) => ({ ...current, entries }));
      }),
    [repository, weekId],
  );

  async function changeWeek(nextId: WeekId, targetDepartmentId?: string): Promise<void> {
    const requestGeneration = weekLoadGeneration.current + 1;
    weekLoadGeneration.current = requestGeneration;
    selectionGeneration.current += 1;
    const next = await repository.load(nextId);
    if (requestGeneration !== weekLoadGeneration.current) return;
    const nextWeek = next.weeks.find((week) => week.id === nextId) ?? next.weeks[0];
    if (nextWeek === undefined) return;
    const nextDepartments = activeSnapshotDepartments(nextWeek);
    const nextDepartmentId = nextDepartments.some(
      (department) => department.id === targetDepartmentId,
    )
      ? (targetDepartmentId ?? "")
      : nextDepartments.some((department) => department.id === departmentId)
        ? departmentId
        : (nextDepartments[0]?.id ?? "");
    selection.current = { weekId: nextWeek.id, departmentId: nextDepartmentId };
    setSnapshot(next);
    setWeekId(nextWeek.id);
    setDepartmentId(nextDepartmentId);
    setDraft(
      next.entries.find((entry) => entry.departmentId === nextDepartmentId)?.htmlContent ?? "",
    );
    setSaveState("idle");
  }

  function changeDepartment(nextId: string): void {
    selectionGeneration.current += 1;
    weekLoadGeneration.current += 1;
    selection.current = { weekId, departmentId: nextId };
    setDepartmentId(nextId);
    const entry = snapshot.entries.find((item) => item.departmentId === nextId);
    setDraft(entry?.htmlContent ?? "");
    setSaveState("idle");
  }

  function updateDraft(html: string): void {
    setDraft(html);
    setSaveState("dirty");
  }

  async function applyReusableContent(
    targetWeekId: WeekId,
    targetDepartmentId: string,
    html: string,
    mode: "append" | "replace",
  ): Promise<void> {
    const requestGeneration = weekLoadGeneration.current + 1;
    weekLoadGeneration.current = requestGeneration;
    selectionGeneration.current += 1;
    const next = targetWeekId === weekId ? snapshot : await repository.load(targetWeekId);
    if (requestGeneration !== weekLoadGeneration.current) return;
    const targetWeek = next.weeks.find((week) => week.id === targetWeekId);
    const targetDepartment = activeSnapshotDepartments(targetWeek).find(
      (department) => department.id === targetDepartmentId,
    );
    if (targetWeek === undefined || targetDepartment === undefined) return;
    const existingHtml =
      next.entries.find((entry) => entry.departmentId === targetDepartmentId)?.htmlContent ?? "";
    const nextDraft =
      mode === "append" ? appendEditorHtml(existingHtml, html) : sanitizeEditorHtml(html);
    selection.current = { weekId: targetWeekId, departmentId: targetDepartmentId };
    setSnapshot(next);
    setWeekId(targetWeekId);
    setDepartmentId(targetDepartmentId);
    setDraft(nextDraft);
    setSaveState("dirty");
  }

  async function save(): Promise<void> {
    if (selectedWeek === undefined || selectedDepartment === undefined) return;
    const origin = { weekId: selectedWeek.id, departmentId: selectedDepartment.id };
    const originGeneration = selectionGeneration.current;
    setSaveState("saving");
    try {
      const htmlContent = sanitizeEditorHtml(draft);
      const result = await repository.saveEntry({
        weekId: origin.weekId,
        departmentId: origin.departmentId,
        htmlContent,
        plainText: htmlToPlainText(htmlContent),
        expectedVersion: selectedEntry?.version ?? 0,
      });
      if (
        originGeneration !== selectionGeneration.current ||
        selection.current.weekId !== origin.weekId ||
        selection.current.departmentId !== origin.departmentId
      ) {
        return;
      }
      if (result.status === "conflict") {
        setSaveState("conflict");
        return;
      }
      setDraft(result.entry.htmlContent);
      setSnapshot((current) => ({
        ...current,
        entries: replaceEntry(current.entries, result.entry),
      }));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function createWeek(nextWeekId: WeekId): Promise<void> {
    const requestGeneration = createWeekGeneration.current + 1;
    createWeekGeneration.current = requestGeneration;
    const loadGeneration = weekLoadGeneration.current + 1;
    weekLoadGeneration.current = loadGeneration;
    const origin = { ...selection.current };
    const originSelectionGeneration = selectionGeneration.current;
    const week = await repository.createWeek(nextWeekId);
    if (
      requestGeneration !== createWeekGeneration.current ||
      loadGeneration !== weekLoadGeneration.current ||
      originSelectionGeneration !== selectionGeneration.current ||
      selection.current.weekId !== origin.weekId ||
      selection.current.departmentId !== origin.departmentId
    ) {
      return;
    }
    const nextDepartmentId = activeSnapshotDepartments(week)[0]?.id ?? "";
    selectionGeneration.current += 1;
    weekLoadGeneration.current += 1;
    selection.current = { weekId: week.id, departmentId: nextDepartmentId };
    setSnapshot((current) => ({
      ...current,
      weeks: [week, ...current.weeks.filter((item) => item.id !== week.id)],
      entries: [],
    }));
    setWeekId(week.id);
    setDepartmentId(nextDepartmentId);
    setDraft("");
    setSaveState("idle");
  }

  function cancelWeekCreation(): void {
    createWeekGeneration.current += 1;
    lifecycleGeneration.current += 1;
  }

  const { archiveWeek, restoreWeek } = createWeekTrashActions({
    repository,
    selection,
    selectionGeneration,
    weekLoadGeneration,
    lifecycleGeneration,
    setSnapshot,
    setWeekId,
    setDepartmentId,
    setDraft,
    setSaveState,
  });

  async function saveDepartments(nextDepartments: readonly Department[]): Promise<void> {
    if (selectedWeek === undefined) return;
    const origin = { weekId: selectedWeek.id, departmentId };
    const originGeneration = selectionGeneration.current;
    const next = await repository.saveDepartments(origin.weekId, nextDepartments);
    if (
      originGeneration !== selectionGeneration.current ||
      selection.current.weekId !== origin.weekId ||
      selection.current.departmentId !== origin.departmentId
    ) {
      return;
    }
    const refreshedWeek = next.weeks.find((week) => week.id === origin.weekId) ?? next.weeks[0];
    if (refreshedWeek === undefined) return;
    const refreshedDepartments = activeSnapshotDepartments(refreshedWeek);
    const refreshedDepartmentId = refreshedDepartments.some(
      (department) => department.id === origin.departmentId,
    )
      ? origin.departmentId
      : (refreshedDepartments[0]?.id ?? "");
    selectionGeneration.current += 1;
    weekLoadGeneration.current += 1;
    selection.current = { weekId: refreshedWeek.id, departmentId: refreshedDepartmentId };
    setSnapshot(next);
    setWeekId(refreshedWeek.id);
    setDepartmentId(refreshedDepartmentId);
    setDraft(
      next.entries.find((entry) => entry.departmentId === refreshedDepartmentId)?.htmlContent ?? "",
    );
    setSaveState("idle");
  }

  return {
    snapshot,
    weekId,
    departmentId,
    draft,
    saveState,
    selectedWeek,
    weekDepartments,
    selectedDepartment,
    changeWeek,
    changeDepartment,
    updateDraft,
    applyReusableContent,
    save,
    createWeek,
    cancelWeekCreation,
    archiveWeek,
    restoreWeek,
    saveDepartments,
  };
}

function replaceEntry(entries: readonly Entry[], replacement: Entry): readonly Entry[] {
  return [
    ...entries.filter((entry) => entry.departmentId !== replacement.departmentId),
    replacement,
  ];
}
