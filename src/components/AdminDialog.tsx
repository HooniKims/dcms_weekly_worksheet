import { ArrowsClockwise } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import type { Department, DepartmentSnapshot, Week } from "../domain/models";
import { type WeekId, weekIdSchema } from "../domain/week";
import { AdminDepartmentManager } from "./AdminDepartmentManager";
import { AdminWeekTrash } from "./AdminWeekTrash";

type AdminDialogProps = Readonly<{
  onClose: () => void;
  onSignIn: (password: string) => Promise<void>;
  onCreateWeek: (weekId: WeekId) => Promise<void>;
  onArchiveWeek: (weekId: WeekId) => Promise<void>;
  onRestoreWeek: (weekId: WeekId) => Promise<void>;
  onSaveDepartments: (departments: readonly Department[]) => Promise<void>;
  onRebuildSearchIndex: () => Promise<void>;
  selectedWeekLabel: string;
  selectedWeekId: WeekId;
  activeWeeks: readonly Week[];
  archivedWeeks: readonly Week[];
  departments: readonly DepartmentSnapshot[];
  demo: boolean;
  confirmArchiveWeek?: (message: string) => boolean;
}>;

type BusyAction = "sign-in" | "create-week" | "rebuild-search" | null;

export function AdminDialog({
  onClose,
  onSignIn,
  onCreateWeek,
  onArchiveWeek,
  onRestoreWeek,
  onSaveDepartments,
  onRebuildSearchIndex,
  selectedWeekLabel,
  selectedWeekId,
  activeWeeks,
  archivedWeeks,
  departments,
  demo,
  confirmArchiveWeek,
}: AdminDialogProps) {
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [date, setDate] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage("");
    setBusyAction("sign-in");
    try {
      await onSignIn(password);
      setSignedIn(true);
    } catch {
      setMessage("관리자 비밀번호를 확인해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createWeek(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = weekIdSchema.safeParse(date);
    if (!parsed.success) return;
    setMessage("");
    setBusyAction("create-week");
    try {
      await onCreateWeek(parsed.data);
      setMessage(`${date} 주차를 준비했습니다.`);
    } catch {
      setMessage("주차를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function rebuildSearchIndex(): Promise<void> {
    if (!window.confirm("모든 주차의 검색 색인을 다시 만들까요?")) return;
    setMessage("");
    setBusyAction("rebuild-search");
    try {
      await onRebuildSearchIndex();
      setMessage("검색 색인을 다시 만들었습니다.");
    } catch {
      setMessage("검색 색인을 다시 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <dialog className="dialog-backdrop" aria-labelledby="admin-title" open>
      <section className="admin-dialog">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ADMIN</p>
            <h2 id="admin-title">관리자 도구</h2>
          </div>
          <button className="ghost-button compact" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        {!signedIn ? (
          <form className="admin-form" onSubmit={(event) => void signIn(event)}>
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {demo && (
              <p className="demo-hint">
                개발 미리보기 관리자 비밀번호: {import.meta.env.VITE_LOCAL_ADMIN_PASSWORD}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={busyAction === "sign-in"}>
              {busyAction === "sign-in" ? "관리자 확인 중…" : "관리자 확인"}
            </button>
          </form>
        ) : (
          <div className="admin-tools">
            <p className="admin-success">관리자 권한이 확인되었습니다.</p>
            <p className="admin-week-context">선택한 주차: {selectedWeekLabel}</p>
            <form className="admin-form admin-section" onSubmit={(event) => void createWeek(event)}>
              <h3>새 주차 만들기</h3>
              <label htmlFor="week-date">새 주차 기준일</label>
              <input
                id="week-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
              <button
                className="primary-button"
                type="submit"
                disabled={busyAction === "create-week"}
              >
                {busyAction === "create-week" ? "주차 생성 중…" : "주차 생성하기"}
              </button>
              <p className="form-help">새 주차는 관리자가 날짜를 직접 선택해 생성합니다.</p>
            </form>
            <AdminWeekTrash
              selectedWeekId={selectedWeekId}
              activeWeeks={activeWeeks}
              archivedWeeks={archivedWeeks}
              onArchiveWeek={onArchiveWeek}
              onRestoreWeek={onRestoreWeek}
              onMessage={setMessage}
              confirmArchive={confirmArchiveWeek}
            />
            <AdminDepartmentManager
              key={selectedWeekId}
              departments={departments}
              onSaveDepartments={onSaveDepartments}
              onMessage={setMessage}
            />
            <section className="admin-section admin-repair" aria-labelledby="search-rebuild-title">
              <h3 id="search-rebuild-title">검색 색인 복구</h3>
              <p className="form-help">검색 결과가 누락될 때만 모든 주차의 색인을 다시 만드세요.</p>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void rebuildSearchIndex()}
                disabled={busyAction === "rebuild-search"}
              >
                <ArrowsClockwise size={17} />
                {busyAction === "rebuild-search" ? "검색 색인 생성 중…" : "검색 색인 다시 만들기"}
              </button>
            </section>
          </div>
        )}
        {message.length > 0 && (
          <p className="dialog-message" role="status">
            {message}
          </p>
        )}
      </section>
    </dialog>
  );
}
