import { useRef, useState } from "react";
import type { WorkspaceRepository, WorkspaceSnapshot } from "../data/repository";
import { findClosestDepartmentId } from "../domain/departments";
import type { SearchResult } from "../domain/models";
import type { WeekId } from "../domain/week";
import { AdminDialog } from "./AdminDialog";
import { PrintPreviewDialog } from "./PrintPreviewDialog";
import { ReuseDialog, type ReuseSource } from "./ReuseDialog";
import { useWorkspaceController } from "./useWorkspaceController";
import { WorkspaceContent, type WorkspaceTab } from "./WorkspaceContent";
import { MobileSelectors, WorkspaceHeader, WorkspaceNavigation } from "./WorkspaceNavigation";

type WorkspaceProps = Readonly<{
  repository: WorkspaceRepository;
  initialData: WorkspaceSnapshot;
  demo: boolean;
  onLogout: () => Promise<void>;
}>;

export function Workspace({ repository, initialData, demo, onLogout }: WorkspaceProps) {
  const workspace = useWorkspaceController(repository, initialData);
  const [tab, setTab] = useState<WorkspaceTab>("edit");
  const [adminOpen, setAdminOpen] = useState(false);
  const [administratorVerified, setAdministratorVerified] = useState(false);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [reuseSource, setReuseSource] = useState<ReuseSource>();
  const [reuseDestinationId, setReuseDestinationId] = useState("");
  const reuseLoadGeneration = useRef(0);
  const currentInputWeek = workspace.snapshot.weeks[0];
  const currentInputDepartments = [...(currentInputWeek?.departmentSnapshot ?? [])]
    .filter((department) => department.active)
    .sort((left, right) => left.order - right.order);
  const suggestedDestinationId =
    reuseSource === undefined
      ? undefined
      : findClosestDepartmentId(reuseSource.result.departmentName, currentInputDepartments);

  function closeReuseDialog(): void {
    reuseLoadGeneration.current += 1;
    setReuseSource(undefined);
    setReuseDestinationId("");
  }

  async function changeWeek(nextId: WeekId, targetDepartmentId?: string): Promise<void> {
    closeReuseDialog();
    await workspace.changeWeek(nextId, targetDepartmentId);
  }

  function changeDepartment(nextId: string): void {
    closeReuseDialog();
    workspace.changeDepartment(nextId);
  }

  async function selectSearchResult(result: SearchResult): Promise<void> {
    const requestGeneration = reuseLoadGeneration.current + 1;
    reuseLoadGeneration.current = requestGeneration;
    setReuseDestinationId(
      findClosestDepartmentId(result.departmentName, currentInputDepartments) ?? "",
    );
    setReuseSource({ status: "loading", result });
    try {
      const source = await repository.load(result.weekId);
      if (requestGeneration !== reuseLoadGeneration.current) return;
      const entry = source.entries.find((item) => item.departmentId === result.departmentId);
      setReuseSource({ status: "ready", result, htmlContent: entry?.htmlContent ?? "" });
    } catch {
      if (requestGeneration !== reuseLoadGeneration.current) return;
      setReuseSource({ status: "error", result });
    }
  }

  async function appendReuseSource(): Promise<void> {
    if (
      reuseSource?.status !== "ready" ||
      currentInputWeek === undefined ||
      reuseDestinationId.length === 0
    ) {
      return;
    }
    await workspace.applyReusableContent(
      currentInputWeek.id,
      reuseDestinationId,
      reuseSource.htmlContent,
      "append",
    );
    setTab("edit");
    closeReuseDialog();
  }

  async function replaceWithReuseSource(): Promise<void> {
    if (
      reuseSource?.status !== "ready" ||
      currentInputWeek === undefined ||
      reuseDestinationId.length === 0
    ) {
      return;
    }
    await workspace.applyReusableContent(
      currentInputWeek.id,
      reuseDestinationId,
      reuseSource.htmlContent,
      "replace",
    );
    setTab("edit");
    closeReuseDialog();
  }

  async function navigateToReuseSource(): Promise<void> {
    if (reuseSource === undefined) return;
    const result = reuseSource.result;
    closeReuseDialog();
    setTab("edit");
    await workspace.changeWeek(result.weekId, result.departmentId);
  }

  async function authenticateAdministrator(password: string): Promise<void> {
    await repository.signInAdmin(password);
    setAdministratorVerified(true);
  }

  function closeAdmin(): void {
    workspace.cancelWeekCreation();
    setAdminOpen(false);
  }

  if (workspace.selectedWeek === undefined) {
    return <p className="loading-page">표시할 주차가 없습니다.</p>;
  }

  return (
    <main className="workspace-page">
      <WorkspaceHeader
        reportVisible={administratorVerified}
        onAdmin={() => setAdminOpen(true)}
        onLogout={onLogout}
        onPrintPreview={() => setPrintPreviewOpen(true)}
      />
      <MobileSelectors
        snapshot={workspace.snapshot}
        departments={workspace.weekDepartments}
        weekId={workspace.weekId}
        departmentId={workspace.departmentId}
        onWeekChange={changeWeek}
        onDepartmentChange={changeDepartment}
      />

      <div className="workspace-grid">
        <WorkspaceNavigation
          snapshot={workspace.snapshot}
          departments={workspace.weekDepartments}
          weekId={workspace.weekId}
          departmentId={workspace.departmentId}
          onWeekChange={changeWeek}
          onDepartmentChange={changeDepartment}
        />

        <WorkspaceContent
          week={workspace.selectedWeek}
          departments={workspace.weekDepartments}
          entries={workspace.snapshot.entries}
          selectedDepartment={workspace.selectedDepartment}
          draft={workspace.draft}
          saveState={workspace.saveState}
          tab={tab}
          reportVisible={administratorVerified}
          search={repository.search}
          onSearchResultSelect={(result) => void selectSearchResult(result)}
          onTabChange={setTab}
          onDraftChange={workspace.updateDraft}
          onSave={workspace.save}
        />
      </div>
      {reuseSource !== undefined && (
        <ReuseDialog
          source={reuseSource}
          targetWeekLabel={currentInputWeek?.dateLabel ?? "현재"}
          departments={currentInputDepartments}
          destinationId={reuseDestinationId}
          suggestedDestinationId={suggestedDestinationId}
          onDestinationChange={setReuseDestinationId}
          onAppend={() => void appendReuseSource()}
          onReplace={() => void replaceWithReuseSource()}
          onNavigate={() => void navigateToReuseSource()}
          onClose={closeReuseDialog}
        />
      )}
      {adminOpen && (
        <AdminDialog
          demo={demo}
          onClose={closeAdmin}
          onSignIn={authenticateAdministrator}
          onCreateWeek={workspace.createWeek}
          onSaveDepartments={workspace.saveDepartments}
          onRebuildSearchIndex={() => repository.rebuildSearchIndex()}
          selectedWeekLabel={workspace.selectedWeek.dateLabel}
          departments={workspace.weekDepartments}
        />
      )}
      {printPreviewOpen && (
        <PrintPreviewDialog
          week={workspace.selectedWeek}
          departments={workspace.weekDepartments}
          entries={workspace.snapshot.entries}
          onClose={() => setPrintPreviewOpen(false)}
        />
      )}
    </main>
  );
}
