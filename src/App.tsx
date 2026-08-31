import { lazy, Suspense, useEffect, useState } from "react";
import { LockScreen } from "./components/LockScreen";
import { getRepository, isLocalDemo } from "./data";
import type { WorkspaceRepository, WorkspaceSnapshot } from "./data/repository";

type ReadyState = Readonly<{ repository: WorkspaceRepository; snapshot: WorkspaceSnapshot }>;
const sessionMarker = "weekly-work-session";

const Workspace = lazy(() =>
  import("./components/Workspace").then((module) => ({ default: module.Workspace })),
);
const DemoPrintPreview = lazy(() =>
  import("./components/DemoPrintPreview").then((module) => ({
    default: module.DemoPrintPreview,
  })),
);
const DemoWorkspacePreview = lazy(() =>
  import("./components/DemoWorkspacePreview").then((module) => ({
    default: module.DemoWorkspacePreview,
  })),
);
const DemoPrintDialogPreview = lazy(() =>
  import("./components/DemoPrintDialogPreview").then((module) => ({
    default: module.DemoPrintDialogPreview,
  })),
);

export function App() {
  const preview = new URLSearchParams(window.location.search);
  const [ready, setReady] = useState<ReadyState>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(sessionMarker) === null) return;
    let active = true;
    void getRepository()
      .then(async (repository) => {
        if (!(await repository.restoreSession())) {
          localStorage.removeItem(sessionMarker);
          return;
        }
        const snapshot = await repository.load();
        if (active) setReady({ repository, snapshot });
      })
      .catch(() => localStorage.removeItem(sessionMarker));
    return () => {
      active = false;
    };
  }, []);

  async function unlock(password: string): Promise<void> {
    setLoading(true);
    try {
      const repository = await getRepository();
      await repository.unlock(password);
      localStorage.setItem(sessionMarker, "active");
      const snapshot = await repository.load();
      setReady({ repository, snapshot });
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout(): Promise<void> {
    const repository = ready?.repository;
    try {
      if (repository !== undefined) await repository.logout();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    } finally {
      localStorage.removeItem(sessionMarker);
      setReady(undefined);
      setLoading(false);
    }
  }

  if (isLocalDemo && preview.has("print-preview")) {
    return (
      <Suspense fallback={null}>
        <DemoPrintPreview />
      </Suspense>
    );
  }

  if (isLocalDemo && preview.has("workspace-preview")) {
    return (
      <Suspense fallback={<p className="loading-page">업무 화면을 준비하는 중…</p>}>
        <DemoWorkspacePreview />
      </Suspense>
    );
  }

  if (isLocalDemo && preview.has("a4-dialog-preview")) {
    return (
      <Suspense fallback={null}>
        <DemoPrintDialogPreview />
      </Suspense>
    );
  }

  if (isLocalDemo && preview.has("lock-preview")) {
    return <LockScreen onUnlock={unlock} showDemoHint />;
  }

  if (ready === undefined) {
    return <LockScreen onUnlock={unlock} showDemoHint={isLocalDemo && !loading} />;
  }

  return (
    <Suspense fallback={<p className="loading-page">업무 화면을 준비하는 중…</p>}>
      <Workspace
        repository={ready.repository}
        initialData={ready.snapshot}
        demo={isLocalDemo}
        onLogout={handleLogout}
      />
    </Suspense>
  );
}
