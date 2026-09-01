import { ArrowCounterClockwise, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import type { Week } from "../domain/models";
import type { WeekId } from "../domain/week";

type AdminWeekTrashProps = Readonly<{
  selectedWeekId: WeekId;
  selectedWeekLabel: string;
  activeWeekCount: number;
  archivedWeeks: readonly Week[];
  onArchiveWeek: (weekId: WeekId) => Promise<void>;
  onRestoreWeek: (weekId: WeekId) => Promise<void>;
  onMessage: (message: string) => void;
  confirmArchive?: ((message: string) => boolean) | undefined;
}>;

type BusyAction = "archive" | "restore" | null;

export function AdminWeekTrash({
  selectedWeekId,
  selectedWeekLabel,
  activeWeekCount,
  archivedWeeks,
  onArchiveWeek,
  onRestoreWeek,
  onMessage,
  confirmArchive = window.confirm,
}: AdminWeekTrashProps) {
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function archiveWeek(): Promise<void> {
    const confirmed = confirmArchive(
      `${selectedWeekLabel} 주차를 휴지통으로 이동할까요?\n입력 내용과 수정 기록은 삭제되지 않으며 일반 목록과 검색에서 숨겨집니다.`,
    );
    if (!confirmed) return;
    onMessage("");
    setBusyAction("archive");
    try {
      await onArchiveWeek(selectedWeekId);
      onMessage("선택한 주차를 휴지통으로 이동했습니다.");
    } catch {
      onMessage("주차를 휴지통으로 이동하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function restoreWeek(weekId: WeekId): Promise<void> {
    onMessage("");
    setBusyAction("restore");
    try {
      await onRestoreWeek(weekId);
      onMessage("주차를 복원했습니다.");
    } catch {
      onMessage("주차를 복원하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="admin-section admin-week-manager" aria-labelledby="week-manager-title">
      <div className="admin-section-heading">
        <div>
          <h3 id="week-manager-title">주차 관리</h3>
          <p className="form-help">내용은 보존한 채 목록과 검색에서 숨기거나 복원합니다.</p>
        </div>
        <button
          className="ghost-button compact week-trash-action"
          type="button"
          onClick={() => void archiveWeek()}
          disabled={activeWeekCount <= 1 || busyAction !== null}
        >
          <Trash size={16} />
          {busyAction === "archive" ? "이동 중…" : "선택한 주차를 휴지통으로 이동"}
        </button>
      </div>
      {activeWeekCount <= 1 && (
        <p className="form-help week-trash-help">
          마지막 활성 주차는 휴지통으로 이동할 수 없습니다.
        </p>
      )}
      <h4 className="week-trash-title">휴지통</h4>
      {archivedWeeks.length === 0 ? (
        <p className="form-help week-trash-empty">휴지통에 보관된 주차가 없습니다.</p>
      ) : (
        <ul className="week-trash-list" aria-label="휴지통 주차">
          {archivedWeeks.map((week) => (
            <li key={week.id}>
              <span>{week.dateLabel}</span>
              <button
                className="ghost-button compact"
                type="button"
                aria-label={`${week.dateLabel} 복원`}
                onClick={() => void restoreWeek(week.id)}
                disabled={busyAction !== null}
              >
                <ArrowCounterClockwise size={16} /> 복원
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
