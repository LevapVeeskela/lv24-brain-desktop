import type { MemorySource } from "@/entities/memory/api/memoryApi";
import type { ProjectsSource } from "@/entities/project/api/projectApi";
import {
  catchupReport,
  proposalOutcome,
  proposalPage,
  project,
  projectState,
  recordDetail,
  recordPage,
  reviewReport,
  searchPage,
} from "./fixtures";

export function memorySource(overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    listRecords: async () => recordPage([]),
    getRecord: async () => recordDetail(),
    search: async () => searchPage(),
    review: async () => reviewReport(),
    listProposals: async () => proposalPage(),
    promote: async () => proposalOutcome(),
    dismiss: async () => proposalOutcome({ proposalStatus: "dismissed", dismissed: true }),
    catchup: async () => catchupReport(),
    ...overrides,
  };
}

export function projectsSource(
  overrides: Partial<ProjectsSource> = {},
): ProjectsSource {
  return {
    list: async () => [project()],
    state: async () => projectState(),
    saveState: async (_projectId, patch) =>
      projectState({
        goal: patch.goal ?? "Ship 1.2",
        nextAction: patch.nextAction ?? "Write tests",
        active: patch.active ?? ["memory UI"],
        revision: "rev-2",
      }),
    ...overrides,
  };
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
