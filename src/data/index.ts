import type { WorkspaceRepository } from "./repository";

export const isLocalDemo = import.meta.env.VITE_LOCAL_DEMO === "true";

export async function getRepository(): Promise<WorkspaceRepository> {
  if (isLocalDemo) return (await import("./localRepository")).localRepository;
  return (await import("./firebaseRepository")).firebaseRepository;
}
