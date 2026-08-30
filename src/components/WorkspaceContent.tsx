import { FloppyDisk, WarningCircle } from "@phosphor-icons/react";
import type { WorkspaceRepository } from "../data/repository";
import type { DepartmentSnapshot, Entry, SearchResult, Week } from "../domain/models";
import { ReportView } from "./ReportView";
import { RichEditor } from "./RichEditor";
import { WorkspaceSearch } from "./WorkspaceSearch";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
export type WorkspaceTab = "report" | "edit";

type WorkspaceContentProps = Readonly<{
  week: Week;
  departments: readonly DepartmentSnapshot[];
  entries: readonly Entry[];
  selectedDepartment: DepartmentSnapshot | undefined;
  draft: string;
  saveState: SaveState;
  tab: WorkspaceTab;
  reportVisible: boolean;
  search: WorkspaceRepository["search"];
  onSearchResultSelect: (result: SearchResult) => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onDraftChange: (html: string) => void;
  onSave: () => Promise<void>;
}>;

export function WorkspaceContent({
  week,
  departments,
  entries,
  selectedDepartment,
  draft,
  saveState,
  tab,
  reportVisible,
  search,
  onSearchResultSelect,
  onTabChange,
  onDraftChange,
  onSave,
}: WorkspaceContentProps) {
  const showReport = reportVisible && tab === "report";
  return (
    <section className="workspace-main">
      <div className="content-heading">
        <div>
          <p className="content-date">{week.dateLabel}</p>
          <h2>{week.meetingTitle}</h2>
        </div>
        <div className="content-heading-actions">
          <WorkspaceSearch search={search} onResultSelect={onSearchResultSelect} />
          {reportVisible && (
            <div className="tabs" role="tablist" aria-label="관리자 보기 전환">
              <button
                className={showReport ? "active" : ""}
                type="button"
                onClick={() => onTabChange("report")}
              >
                주간표
              </button>
              <button
                className={!showReport ? "active" : ""}
                type="button"
                onClick={() => onTabChange("edit")}
              >
                편집
              </button>
            </div>
          )}
        </div>
      </div>
      {showReport ? (
        <ReportView week={week} departments={departments} entries={entries} />
      ) : (
        <section className="edit-panel">
          <div className="edit-heading">
            <div>
              <p className="eyebrow">DEPARTMENT</p>
              <h3>{selectedDepartment?.name}</h3>
            </div>
            <SaveStatus state={saveState} />
          </div>
          <RichEditor value={draft} onChange={onDraftChange} />
          {saveState === "conflict" && (
            <p className="conflict-message">
              <WarningCircle size={19} /> 다른 사람이 먼저 수정했습니다. 주간표를 새로 열어 최신
              내용을 확인해 주세요.
            </p>
          )}
          {saveState === "error" && (
            <p className="form-error">저장하지 못했습니다. 작성 내용은 그대로 보관 중입니다.</p>
          )}
          <div className="save-row">
            <p>저장 버튼을 눌러야 변경 내용이 반영됩니다.</p>
            <button
              className="primary-button"
              type="button"
              onClick={() => void onSave()}
              disabled={saveState === "saving"}
            >
              <FloppyDisk size={18} /> {saveState === "saving" ? "저장 중…" : "변경 내용 저장"}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function SaveStatus({ state }: Readonly<{ state: SaveState }>) {
  const label = {
    idle: "저장됨",
    dirty: "저장 전 변경사항",
    saving: "저장 중",
    saved: "방금 저장됨",
    conflict: "수정 충돌",
    error: "저장 실패",
  }[state];
  return <span className={`save-status ${state}`}>{label}</span>;
}
