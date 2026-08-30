import { useEffect, useState } from "react";
import { localRepository } from "../data/localRepository";
import type { WorkspaceSnapshot } from "../data/repository";
import { weekIdSchema } from "../domain/week";
import { ReportView } from "./ReportView";

const requestedWeek = weekIdSchema.safeParse(
  new URLSearchParams(window.location.search).get("week"),
);
const previewWeekId = requestedWeek.success ? requestedWeek.data : "2026-08-31";

export function DemoPrintPreview() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>();

  useEffect(() => {
    void localRepository.load(previewWeekId).then(setSnapshot);
  }, []);

  const week = snapshot?.weeks.find((item) => item.id === previewWeekId);
  if (snapshot === undefined || week === undefined) return null;

  return (
    <main className="print-preview">
      <ReportView week={week} departments={snapshot.departments} entries={snapshot.entries} />
    </main>
  );
}
