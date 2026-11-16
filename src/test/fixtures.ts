import type {
  CatchupReport,
  MemoryRecord,
  Proposal,
  ProposalOutcome,
  ProposalPage,
  RecordDetail,
  RecordPage,
  ReviewReport,
  SearchPage,
} from "@/entities/memory/model/types";
import type { Project, ProjectState } from "@/entities/project/model/types";

export const timestamp = "2026-11-16T05:30:00Z";

export function memoryRecord(
  overrides: Partial<MemoryRecord> & { id?: string; kind?: MemoryRecord["kind"] } = {},
): MemoryRecord {
  const id = overrides.id ?? "note-2026-1";
  return {
    id,
    projectId: "lv24",
    kind: overrides.kind ?? "note",
    title: "Fixture record",
    path: `projects/lv24/memory/${id}.md`,
    validity: { current: true },
    provenance: {
      origin: "human",
      trust: "verified",
      reviewed: true,
      quarantined: false,
      needsReview: false,
    },
    review: { due: false },
    updatedAt: timestamp,
    createdAt: timestamp,
    ...overrides,
  };
}

export function recordPage(
  items: MemoryRecord[],
  options: { page?: number; hasMore?: boolean; nextCursor?: string } = {},
): RecordPage {
  return {
    items,
    page: options.page ?? 1,
    pageSize: 25,
    hasMore: options.hasMore ?? false,
    nextCursor: options.nextCursor,
  };
}

export function recordDetail(overrides: Partial<RecordDetail> = {}): RecordDetail {
  const base = memoryRecord(overrides);
  return {
    ...base,
    body: "## Decision\n\nUse SQLite FTS5.",
    bodyTruncated: false,
    bodyTokens: 12,
    maxTokens: 4000,
    links: [],
    backlinks: [],
    relations: [],
    ...overrides,
  };
}

export function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "prop-1",
    projectId: "lv24",
    kind: "decision",
    title: "Use SQLite FTS5",
    confidence: 0.82,
    status: "pending",
    connectionId: "github-main",
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceStale: false,
    sourceOrphan: false,
    localOnly: false,
    ...overrides,
  };
}

export function reviewReport(
  proposals: Proposal[] = [],
  overrides: Partial<ReviewReport> = {},
): ReviewReport {
  return {
    projectId: "lv24",
    findings: [],
    dueReviews: [],
    proposals,
    pendingCount: proposals.length,
    quarantinedCount: 0,
    ...overrides,
  };
}

export function projectState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    projectId: "lv24",
    goal: "Ship 1.2",
    nextAction: "Write tests",
    active: ["memory UI"],
    blocked: [],
    openQuestions: [],
    updatedAt: timestamp,
    revision: "rev-1",
    ...overrides,
  };
}

export function project(overrides: Partial<Project> = {}): Project {
  return { id: "lv24", name: "LV24", ...overrides };
}

export function searchPage(
  hits: SearchPage["hits"] = [],
  overrides: Partial<SearchPage> = {},
): SearchPage {
  return {
    query: "sqlite",
    page: 1,
    pageSize: 20,
    hasMore: false,
    relaxed: false,
    hits,
    ...overrides,
  };
}

export function proposalPage(
  items: Proposal[] = [],
  overrides: Partial<ProposalPage> = {},
): ProposalPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 50,
    hasMore: false,
    ...overrides,
  };
}

export function proposalOutcome(
  overrides: Partial<ProposalOutcome> = {},
): ProposalOutcome {
  return {
    projectId: "lv24",
    proposalId: "prop-1",
    proposalStatus: "promoted",
    recordKind: "decision",
    recordId: "dec-9",
    already: false,
    dismissed: false,
    dryRun: false,
    ...overrides,
  };
}

export function catchupReport(
  records: MemoryRecord[] = [],
  overrides: Partial<CatchupReport> = {},
): CatchupReport {
  return {
    project: { id: "lv24", name: "LV24" },
    since: timestamp,
    sinceSource: "handoff",
    state: projectState(),
    notes: records,
    decisions: [],
    attempts: [],
    handoffs: [],
    journal: [],
    quarantinedCount: 0,
    includeUnreviewed: false,
    ...overrides,
  };
}
