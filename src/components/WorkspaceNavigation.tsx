import { CalendarBlank, Check, Gear, Printer, SignOut } from "@phosphor-icons/react";
import type { WorkspaceSnapshot } from "../data/repository";
import type { DepartmentSnapshot, Week } from "../domain/models";
import { formatKoreanDateWithWeekday, type WeekId, weekIdSchema } from "../domain/week";

type NavigationProps = Readonly<{
  snapshot: WorkspaceSnapshot;
  departments: readonly DepartmentSnapshot[];
  weekId: WeekId;
  departmentId: string;
  onWeekChange: (weekId: WeekId) => Promise<void>;
  onDepartmentChange: (departmentId: string) => void;
}>;

type WeekSelectorProps = Readonly<{
  weeks: readonly Week[];
  weekId: WeekId;
  onWeekChange: (weekId: WeekId) => Promise<void>;
  compact?: boolean;
}>;

function weekOptionLabel(week: Week, currentWeekId: WeekId | undefined): string {
  const status =
    week.id === currentWeekId
      ? "현재 입력"
      : week.createdBy === "migration"
        ? "이전 자료"
        : "업무 주차";
  const weekday = formatKoreanDateWithWeekday(week.id).match(/\([^)]+\)$/)?.[0] ?? "";
  return `${week.id.replaceAll("-", ".")} ${weekday} · ${status}`;
}

function WeekSelector({ weeks, weekId, onWeekChange, compact = false }: WeekSelectorProps) {
  return (
    <label className={compact ? "week-selector compact" : "week-selector"}>
      <span>작성할 날짜</span>
      <select
        aria-label="작성할 날짜"
        value={weekId}
        onChange={(event) => void onWeekChange(weekIdSchema.parse(event.target.value))}
      >
        {weeks.map((week) => (
          <option key={week.id} value={week.id}>
            {weekOptionLabel(week, weeks[0]?.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WorkspaceHeader({
  reportVisible,
  onAdmin,
  onLogout,
}: Readonly<{ reportVisible: boolean; onAdmin: () => void; onLogout: () => Promise<void> }>) {
  return (
    <header className="workspace-header">
      <div>
        <p className="eyebrow">WEEKLY WORK</p>
        <h1>주간업무추진사항</h1>
      </div>
      <div className="header-actions">
        <button className="text-button" type="button" onClick={onAdmin}>
          <Gear size={18} /> 관리자
        </button>
        <button className="text-button" type="button" onClick={() => void onLogout()}>
          <SignOut size={18} /> 로그아웃
        </button>
        {reportVisible && (
          <button className="ghost-button" type="button" onClick={() => window.print()}>
            <Printer size={18} /> A4 인쇄
          </button>
        )}
      </div>
    </header>
  );
}

export function MobileSelectors({
  snapshot,
  departments,
  weekId,
  departmentId,
  onWeekChange,
  onDepartmentChange,
}: NavigationProps) {
  return (
    <div className="mobile-selectors">
      <WeekSelector compact weeks={snapshot.weeks} weekId={weekId} onWeekChange={onWeekChange} />
      <label>
        부서
        <select value={departmentId} onChange={(event) => onDepartmentChange(event.target.value)}>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function WorkspaceNavigation({
  snapshot,
  departments,
  weekId,
  departmentId,
  onWeekChange,
  onDepartmentChange,
}: NavigationProps) {
  return (
    <aside className="workspace-nav">
      <nav aria-label="주차 선택">
        <p className="nav-label">
          <CalendarBlank size={16} /> 입력 날짜
        </p>
        <WeekSelector weeks={snapshot.weeks} weekId={weekId} onWeekChange={onWeekChange} />
      </nav>
      <nav aria-label="부서 선택" className="department-nav">
        <p className="nav-label">부서</p>
        {departments.map((department) => {
          const hasContent = snapshot.entries.some(
            (entry) => entry.departmentId === department.id && entry.plainText.length > 0,
          );
          return (
            <button
              className={
                department.id === departmentId ? "department-item active" : "department-item"
              }
              type="button"
              key={department.id}
              onClick={() => onDepartmentChange(department.id)}
            >
              <span>{department.name}</span>
              {hasContent && <Check size={15} />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
