import type { Dispatch, RefObject, SetStateAction } from "react";
import type { WorkspaceRepository, WorkspaceSnapshot } from "../data/repository";
import type { WeekId } from "../domain/week";
import type { SaveState } from "./WorkspaceContent";

type Selection = { weekId: WeekId; departmentId: string };

type WeekTrashContext = Readonly<{
  repository: WorkspaceRepository;
  selection: RefObject<Selection>;
  selectionGeneration: RefObject<number>;
  weekLoadGeneration: RefObject<number>;
  lifecycleGeneration: RefObject<number>;
  setSnapshot: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  setWeekId: Dispatch<SetStateAction<WeekId>>;
  setDepartmentId: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
}>;

export function createWeekTrashActions(context: WeekTrashContext): Readonly<{
  archiveWeek: (weekId: WeekId) => Promise<void>;
  restoreWeek: (weekId: WeekId) => Promise<void>;
}> {
  async function archiveWeek(targetWeekId: WeekId): Promise<void> {
    const requestGeneration = context.lifecycleGeneration.current + 1;
    context.lifecycleGeneration.current = requestGeneration;
    const origin = { ...context.selection.current };
    const originSelectionGeneration = context.selectionGeneration.current;
    const next = await context.repository.archiveWeek(targetWeekId);
    if (
      requestGeneration !== context.lifecycleGeneration.current ||
      originSelectionGeneration !== context.selectionGeneration.current ||
      context.selection.current.weekId !== origin.weekId ||
      context.selection.current.departmentId !== origin.departmentId
    ) {
      return;
    }
    if (targetWeekId !== origin.weekId) {
      context.setSnapshot((current) => ({
        ...current,
        weeks: next.weeks,
        archivedWeeks: next.archivedWeeks,
        departments: next.departments,
      }));
      return;
    }
    const nextWeek = next.weeks[0];
    if (nextWeek === undefined) return;
    const nextDepartmentId =
      [...nextWeek.departmentSnapshot]
        .filter((department) => department.active)
        .sort((left, right) => left.order - right.order)[0]?.id ?? "";
    context.selectionGeneration.current += 1;
    context.weekLoadGeneration.current += 1;
    context.selection.current = { weekId: nextWeek.id, departmentId: nextDepartmentId };
    context.setSnapshot(next);
    context.setWeekId(nextWeek.id);
    context.setDepartmentId(nextDepartmentId);
    context.setDraft(
      next.entries.find((entry) => entry.departmentId === nextDepartmentId)?.htmlContent ?? "",
    );
    context.setSaveState("idle");
  }

  async function restoreWeek(targetWeekId: WeekId): Promise<void> {
    const requestGeneration = context.lifecycleGeneration.current + 1;
    context.lifecycleGeneration.current = requestGeneration;
    const origin = { ...context.selection.current };
    const originSelectionGeneration = context.selectionGeneration.current;
    const next = await context.repository.restoreWeek(targetWeekId);
    if (
      requestGeneration !== context.lifecycleGeneration.current ||
      originSelectionGeneration !== context.selectionGeneration.current ||
      context.selection.current.weekId !== origin.weekId ||
      context.selection.current.departmentId !== origin.departmentId
    ) {
      return;
    }
    context.setSnapshot((current) => ({
      ...current,
      weeks: next.weeks,
      archivedWeeks: next.archivedWeeks,
      departments: next.departments,
    }));
  }

  return { archiveWeek, restoreWeek };
}
