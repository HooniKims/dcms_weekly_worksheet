import { useEffect, useState } from "react";
import { localRepository } from "../data/localRepository";
import type { WorkspaceSnapshot } from "../data/repository";
import { PrintPreviewDialog } from "./PrintPreviewDialog";

export function DemoPrintDialogPreview() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>();

  useEffect(() => {
    void localRepository.load().then(setSnapshot);
  }, []);

  const week = snapshot?.weeks[0];
  if (snapshot === undefined || week === undefined) return null;

  return (
    <PrintPreviewDialog
      week={week}
      departments={week.departmentSnapshot}
      entries={snapshot.entries}
      onClose={() => undefined}
    />
  );
}
