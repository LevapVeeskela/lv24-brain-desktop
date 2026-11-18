import type { MemorySource } from "@/entities/memory/api/memoryApi";
import type { ProjectsSource } from "@/entities/project/api/projectApi";
import type { RecordReviewRequest } from "@/entities/memory/model/types";
import {
  adoptReport,
  catchupReport,
  memoryRecord,
  proposalDetail,
  proposalOutcome,
  proposalPage,
  proposalSnoozeReceipt,
  project,
  projectState,
  quarantinePage,
  recordDetail,
  recordPage,
  reviewFixResult,
  reviewReport,
  searchPage,
} from "./fixtures";

export function memorySource(overrides: Partial<MemorySource> = {}): MemorySource {
  return {
    listRecords: async () => recordPage([]),
    getRecord: async () => recordDetail(),
    editRecord: async () => recordDetail(),
    trashRecord: async () => recordDetail(),
    restoreRecord: async () => recordDetail(),
    search: async () => searchPage(),
    review: async () => reviewReport(),
    reviewFix: async () => reviewFixResult(),
    reviewRecord: async (
      _projectId: string,
      _recordId: string,
      _request: RecordReviewRequest,
    ) => memoryRecord(),
    listQuarantine: async () => quarantinePage(),
    listProposals: async () => proposalPage(),
    getProposal: async () => proposalDetail(),
    promote: async () => proposalOutcome(),
    dismiss: async () => proposalOutcome({ proposalStatus: "dismissed", dismissed: true }),
    snoozeProposal: async () => proposalSnoozeReceipt(),
    snooze: async () => proposalSnoozeReceipt(),
    clearProposalSnooze: async () => proposalSnoozeReceipt({ snoozed: false }),
    clearSnooze: async () => proposalSnoozeReceipt({ snoozed: false }),
    unsnoozeProposal: async () => proposalSnoozeReceipt({ snoozed: false }),
    unsnooze: async () => proposalSnoozeReceipt({ snoozed: false }),
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
    reviewState: async (_projectId, request) =>
      projectState({
        provenance: {
          origin: "human",
          trust: request.trust ?? "verified",
          reviewed: true,
          quarantined: false,
          needsReview: false,
        },
        ...(request.expectedRevision ? { revision: request.expectedRevision } : {}),
      }),
    adopt: async (apply) =>
      adoptReport({ applied: apply, stamped: apply ? 0 : 1 }),
    addPath: async (_projectId, path) =>
      project({
        paths: [path],
        pathProvenance: { [path]: "DESKTOP-F5INSH6" },
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
