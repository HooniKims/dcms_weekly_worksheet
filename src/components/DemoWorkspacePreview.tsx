import { useEffect, useState } from "react";
import { localRepository } from "../data/localRepository";
import type { WorkspaceSnapshot } from "../data/repository";
import { Workspace } from "./Workspace";

export function DemoWorkspacePreview() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>();

  useEffect(() => {
    void localRepository.load().then(setSnapshot);
  }, []);

  if (snapshot === undefined) {
    return <p className="loading-page">업무 화면을 준비하는 중…</p>;
  }

  return (
    <Workspace
      repository={localRepository}
      initialData={snapshot}
      demo
      onLogout={() => localRepository.logout()}
    />
  );
}
