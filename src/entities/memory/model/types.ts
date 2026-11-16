import type { ProjectState } from "@/entities/project/model/types";

export const RECORD_KINDS = ["note", "decision", "attempt", "handoff"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const SEARCH_KINDS = [...RECORD_KINDS, "state"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const RECORD_SCOPES = ["project", "personal", "global"] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

export const DECISION_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const PROVENANCE_ORIGINS = [
  "human",
  "agent",
  "connector",
  "import",
] as const;
export type ProvenanceOrigin = (typeof PROVENANCE_ORIGINS)[number];

export const TRUST_LEVELS = ["verified", "stated", "inferred"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const REVIEW_SOURCES = ["frontmatter", "default"] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const LINK_STATES = ["found", "missing", "unavailable"] as const;
export type LinkState = (typeof LINK_STATES)[number];

export const RELATION_STATUSES = ["pending", "accepted", "rejected"] as const;
export type RelationStatus = (typeof RELATION_STATUSES)[number];

export const FINDING_SEVERITIES = ["error", "warn", "info"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const PROPOSAL_KINDS = ["decision", "attempt", "note"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = [
  "pending",
  "stale",
  "promoted",
  "dismissed",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const PROPOSAL_DECISION_STATUSES = ["proposed", "accepted"] as const;
export type ProposalDecisionStatus = (typeof PROPOSAL_DECISION_STATUSES)[number];

export interface Provenance {
  origin: ProvenanceOrigin;
  trust: TrustLevel;
  reviewed: boolean;
  quarantined: boolean;
  needsReview: boolean;
}

export interface Validity {
  validFrom?: string;
  validTo?: string;
  supersededBy?: string;
  supersedes?: string;
  confidence?: number;
  current: boolean;
}

export interface ReviewState {
  reviewAfter?: string;
  reviewSource?: ReviewSource;
  due: boolean;
}

export interface MemoryRecord {
  id: string;
  projectId: string;
  kind: RecordKind;
  title: string;
  status?: string;
  path: string;
  permalink?: string;
  subtype?: string;
  scope?: RecordScope;
  topicKey?: string;
  occurrences?: number;
  createdAt?: string;
  updatedAt?: string;
  validity: Validity;
  provenance: Provenance;
  review: ReviewState;
}

export interface PageInfo {
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface RecordPage extends PageInfo {
  items: MemoryRecord[];
}

export interface RecordLink {
  field: string;
  ref: string;
  text?: string;
  projectId?: string;
  id?: string;
  state: LinkState;
  detail?: string;
  target?: MemoryRecord;
}

export interface Backlink {
  field: string;
  source: MemoryRecord;
}

export interface Relation {
  target: string;
  relation: string;
  reason?: string;
  confidence?: number;
  status: RelationStatus;
  judgedAt?: string;
  verdictBy?: string;
}

export interface RecordHistory {
  records: MemoryRecord[];
  anchorIndex: number;
  before: number;
  after: number;
  total: number;
}

export interface RecordDetail extends MemoryRecord {
  body: string;
  bodyTruncated: boolean;
  bodyTokens: number;
  maxTokens: number;
  links: RecordLink[];
  backlinks: Backlink[];
  relations: Relation[];
  history?: RecordHistory;
}

export interface RecordFilters {
  kinds: RecordKind[];
  status: string;
  scope: RecordScope | "";
  subtype: string;
  topic: string;
  dueReview: boolean;
}

export function emptyRecordFilters(): RecordFilters {
  return {
    kinds: [],
    status: "",
    scope: "",
    subtype: "",
    topic: "",
    dueReview: false,
  };
}

export function hasRecordFilters(filters: RecordFilters): boolean {
  return (
    filters.kinds.length > 0 ||
    filters.status !== "" ||
    filters.scope !== "" ||
    filters.subtype.trim() !== "" ||
    filters.topic.trim() !== "" ||
    filters.dueReview
  );
}

export interface RecordListQuery {
  kinds?: RecordKind[];
  status?: string;
  scope?: RecordScope;
  subtype?: string;
  topic?: string;
  since?: string;
  limit?: number;
  cursor?: string;
  dueReview?: boolean;
}

export interface SearchExplain {
  bm25: number;
  recency: number;
  importance: number;
  pin: number;
  link: number;
}

export interface SearchHit {
  id: string;
  projectId: string;
  kind: string;
  title: string;
  preview: string;
  score: number;
  subtype?: string;
  scope?: string;
  topicKey?: string;
  occurrences?: number;
  validFrom?: string;
  validTo?: string;
  supersededBy?: string;
  matchReasons: string[];
  explain?: SearchExplain;
}

export interface SearchPage extends PageInfo {
  query: string;
  relaxed: boolean;
  notice?: string;
  hits: SearchHit[];
}

export interface SearchFilters {
  kinds: SearchKind[];
  mode: "all" | "any" | "";
  minScore: number | null;
  explain: boolean;
}

export const SEARCH_MIN_LENGTH = 2;

export function emptySearchFilters(): SearchFilters {
  return { kinds: [], mode: "", minScore: null, explain: false };
}

export interface SearchRequest {
  query: string;
  projectId: string;
  filters: SearchFilters;
  limit: number;
  cursor?: string;
}

export interface Finding {
  kind: string;
  severity: FindingSeverity;
  message: string;
  why: string;
  next: string;
  confirm: string;
  evidence?: string;
  fixable: boolean;
  fix?: string;
}

export interface DueReview {
  kind: string;
  id: string;
  title: string;
  reviewAfter: string;
  overdueSeconds: number;
  source: string;
}

export interface Proposal {
  id: string;
  projectId: string;
  externalId?: string;
  kind: ProposalKind;
  title: string;
  rule?: string;
  confidence: number;
  status: ProposalStatus;
  connectionId: string;
  createdAt?: string;
  updatedAt?: string;
  sourceStale: boolean;
  sourceOrphan: boolean;
  localOnly: boolean;
  sourceHealth?: string;
}

export interface ProposalPage extends PageInfo {
  items: Proposal[];
  total: number;
}

export interface ProposalListQuery {
  statuses?: ProposalStatus[];
  kind?: ProposalKind;
  limit?: number;
  cursor?: string;
}

export interface ReviewReport {
  projectId: string;
  findings: Finding[];
  dueReviews: DueReview[];
  proposals: Proposal[];
  pendingCount: number;
  quarantinedCount: number;
}

export interface ProposalDecision {
  as?: ProposalKind;
  status?: ProposalDecisionStatus;
  title?: string;
  force?: boolean;
  yes?: boolean;
  allowDuplicate?: boolean;
  allowProtected?: boolean;
  dryRun?: boolean;
}

export interface ProposalOutcome {
  projectId: string;
  proposalId: string;
  proposalStatus: string;
  recordKind?: string;
  recordId?: string;
  recordTitle?: string;
  already: boolean;
  dismissed: boolean;
  dryRun: boolean;
}

export interface JournalEntry {
  time: string;
  event: string;
  project?: string;
  id?: string;
  title?: string;
  fields?: Record<string, string>;
}

export interface CatchupReport {
  project: { id: string; name: string };
  since: string;
  sinceSource: "handoff" | "explicit" | "default";
  baselineHandoffId?: string;
  state: ProjectState;
  notes: MemoryRecord[];
  decisions: MemoryRecord[];
  attempts: MemoryRecord[];
  handoffs: MemoryRecord[];
  journal: JournalEntry[];
  quarantinedCount: number;
  includeUnreviewed: boolean;
}

export function confidenceBand(
  confidence: number,
): "high" | "medium" | "low" {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.5) {
    return "medium";
  }
  return "low";
}

/** Promotion blockers in the order the UI should show them. */
export function proposalBlockers(
  proposal: Proposal,
): Array<"stale" | "orphan" | "local-only"> {
  const blockers: Array<"stale" | "orphan" | "local-only"> = [];
  if (proposal.sourceStale) {
    blockers.push("stale");
  }
  if (proposal.sourceOrphan) {
    blockers.push("orphan");
  }
  if (proposal.localOnly) {
    blockers.push("local-only");
  }
  return blockers;
}

export function isPromotableBulk(proposals: readonly Proposal[]): boolean {
  if (proposals.length === 0) {
    return false;
  }
  const kind = proposals[0].kind;
  return proposals.every(
    (proposal) =>
      proposal.kind === kind &&
      proposal.status !== "promoted" &&
      proposalBlockers(proposal).length === 0,
  );
}
