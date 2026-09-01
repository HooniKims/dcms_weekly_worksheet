import { useState } from "react";
import { defaultDepartments, type Week } from "../domain/models";
import type { WeekId } from "../domain/week";
import { AdminDialog } from "./AdminDialog";

const previewWeeks: readonly Week[] = [
  {
    id: "2026-08-31",
    dateLabel: "2026년 8월 31일",
    meetingTitle: "주간업무추진사항",
    createdBy: "admin",
    createdAt: "2026-08-31T00:00:00.000Z",
    archivedAt: null,
    departmentSnapshot: [...defaultDepartments],
  },
  {
    id: "2026-08-24",
    dateLabel: "2026년 8월 24일",
    meetingTitle: "주간업무추진사항",
    createdBy: "admin",
    createdAt: "2026-08-24T00:00:00.000Z",
    archivedAt: null,
    departmentSnapshot: [...defaultDepartments],
  },
];

export function DemoAdminWeekTrashPreview() {
  const [activeWeeks, setActiveWeeks] = useState(previewWeeks);
  const [archivedWeeks, setArchivedWeeks] = useState<readonly Week[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<WeekId>(previewWeeks[0]?.id ?? "2026-08-31");
  const selectedWeek = activeWeeks.find((week) => week.id === selectedWeekId) ?? activeWeeks[0];

  if (selectedWeek === undefined) return null;

  async function archiveWeek(weekId: WeekId): Promise<void> {
    const target = activeWeeks.find((week) => week.id === weekId);
    if (target === undefined || activeWeeks.length <= 1) return;
    const remainingWeeks = activeWeeks.filter((week) => week.id !== weekId);
    setActiveWeeks(remainingWeeks);
    setSelectedWeekId(remainingWeeks[0]?.id ?? selectedWeekId);
    setArchivedWeeks((current) => [
      { ...target, archivedAt: new Date().toISOString() },
      ...current,
    ]);
  }

  async function restoreWeek(weekId: WeekId): Promise<void> {
    const target = archivedWeeks.find((week) => week.id === weekId);
    if (target === undefined) return;
    setArchivedWeeks((current) => current.filter((week) => week.id !== weekId));
    setActiveWeeks((current) => [{ ...target, archivedAt: null }, ...current]);
  }

  return (
    <main className="workspace-page">
      <AdminDialog
        demo={false}
        onClose={() => undefined}
        onSignIn={async () => undefined}
        onCreateWeek={async () => undefined}
        onArchiveWeek={archiveWeek}
        onRestoreWeek={restoreWeek}
        onSaveDepartments={async () => undefined}
        onRebuildSearchIndex={async () => undefined}
        selectedWeekLabel={selectedWeek.dateLabel}
        selectedWeekId={selectedWeek.id}
        activeWeekCount={activeWeeks.length}
        archivedWeeks={archivedWeeks}
        departments={selectedWeek.departmentSnapshot}
        confirmArchiveWeek={() => true}
      />
    </main>
  );
}
