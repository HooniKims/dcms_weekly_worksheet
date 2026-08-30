import type { DepartmentSnapshot, SearchResult } from "../domain/models";
import { SafeHtml } from "./SafeHtml";

export type ReuseSource =
  | Readonly<{ status: "loading"; result: SearchResult }>
  | Readonly<{ status: "ready"; result: SearchResult; htmlContent: string }>
  | Readonly<{ status: "error"; result: SearchResult }>;

type ReuseDialogProps = Readonly<{
  source: ReuseSource;
  targetWeekLabel: string;
  departments: readonly DepartmentSnapshot[];
  destinationId: string;
  suggestedDestinationId: string | undefined;
  onDestinationChange: (departmentId: string) => void;
  onAppend: () => void;
  onReplace: () => void;
  onNavigate: () => void;
  onClose: () => void;
}>;

export function ReuseDialog({
  source,
  targetWeekLabel,
  departments,
  destinationId,
  suggestedDestinationId,
  onDestinationChange,
  onAppend,
  onReplace,
  onNavigate,
  onClose,
}: ReuseDialogProps) {
  const canReuse =
    source.status === "ready" && source.htmlContent.length > 0 && destinationId.length > 0;
  return (
    <dialog className="dialog-backdrop" aria-labelledby="reuse-title" open>
      <section className="reuse-dialog">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">REUSE</p>
            <h2 id="reuse-title">과거 내용 재사용</h2>
          </div>
          <button className="ghost-button compact" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="reuse-source-meta">
          원본: {source.result.dateLabel} · {source.result.departmentName}
        </p>
        <div className="reuse-preview" role="region" aria-label="재사용할 내용 미리보기">
          {source.status === "loading" && <p role="status">저장된 내용을 불러오는 중입니다.</p>}
          {source.status === "error" && (
            <p role="alert">저장된 내용을 불러오지 못했습니다. 다시 시도해 주세요.</p>
          )}
          {source.status === "ready" && source.htmlContent.length > 0 && (
            <SafeHtml className="reuse-preview-content" html={source.htmlContent} />
          )}
          {source.status === "ready" && source.htmlContent.length === 0 && (
            <p>이 부서에는 재사용할 저장 내용이 없습니다.</p>
          )}
        </div>
        <label className="reuse-destination">
          <span>가져올 부서</span>
          <select
            value={destinationId}
            onChange={(event) => onDestinationChange(event.target.value)}
          >
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
                {department.id === suggestedDestinationId ? " (추천)" : ""}
              </option>
            ))}
          </select>
          <small>{targetWeekLabel} 현재 입력 주차로 가져옵니다.</small>
        </label>
        <p className="form-help">
          적용한 내용은 바로 저장되지 않습니다. 편집기에서 확인한 뒤 저장해 주세요.
        </p>
        <div className="reuse-actions">
          <button className="text-button" type="button" onClick={onNavigate}>
            원본 주차 보기
          </button>
          <button className="ghost-button" type="button" onClick={onReplace} disabled={!canReuse}>
            현재 주차 내용 교체
          </button>
          <button className="primary-button" type="button" onClick={onAppend} disabled={!canReuse}>
            현재 주차에 추가
          </button>
        </div>
      </section>
    </dialog>
  );
}
