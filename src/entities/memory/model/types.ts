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
  /** Present when the target record is live, so the UI can deep-link it. */
  targetKind?: RecordKind;
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
  /** Reads every project the agent allowlist serves instead of one project. */
  allProjects?: boolean;
}

/** Wire request for PATCH /v1/records/{id}. */
export interface RecordEditPatch {
  title?: string;
  body?: string;
  tags?: string[];
  expectedUpdatedAt?: string;
  allowDuplicate?: boolean;
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
  projectId: string | null;
  allProjects?: boolean;
  filters: SearchFilters;
  limit: number;
  cursor?: string;
}

export interface Finding {
  /** Set in an all-projects review. */
  projectId?: string;
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
  /** Set in an all-projects review. */
  projectId?: string;
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
  /** Redacted candidate text; present only with include_body=true. */
  body?: string;
  bodyTruncated?: boolean;
  bodyTokens?: number;
  maxTokens?: number;
  /** The item's body did not fit the page budget. */
  bodyOmitted?: boolean;
}

export interface ProposalDetail {
  id: string;
  projectId: string;
  kind: ProposalKind;
  title: string;
  status: string;
  body: string;
  bodyTruncated: boolean;
  bodyTokens: number;
  maxTokens: number;
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
  includeBody?: boolean;
  maxTokens?: number;
}

export interface ReviewReport {
  /** `*` in an all-projects review. */
  projectId: string;
  projectIds: string[];
  allProjects: boolean;
  findings: Finding[];
  dueReviews: DueReview[];
  proposals: Proposal[];
  pendingCount: number;
  quarantinedCount: number;
  findingsTruncated: boolean;
  dueReviewsTruncated: boolean;
  proposalsTruncated: boolean;
}

export const REVIEW_FIX_ACTIONS = [
  "set_next_action",
  "drop_question",
] as const;
export type ReviewFixAction = (typeof REVIEW_FIX_ACTIONS)[number];

export const REVIEW_FIX_FIELDS = ["next_action", "open_questions"] as const;
export type ReviewFixField = (typeof REVIEW_FIX_FIELDS)[number];

export interface ReviewFixChange {
  kind: string;
  action: ReviewFixAction;
  field: ReviewFixField;
  value: string;
  evidence?: string;
}

export interface ReviewFixRequest {
  /** Writes the planned fixes when true; the default is a dry run. */
  apply?: boolean;
  kinds?: string[];
}

export interface ReviewFixResult {
  projectId: string;
  dryRun: boolean;
  findings: Finding[];
  changes: ReviewFixChange[];
}

export const QUARANTINE_REASONS = ["unreviewed", "unknown_origin"] as const;
export type QuarantineReason = (typeof QUARANTINE_REASONS)[number];

export interface QuarantineItem {
  id: string;
  kind: RecordKind;
  projectId: string;
  title: string;
  reason: QuarantineReason;
  origin?: string;
  trust?: string;
  createdAt?: string;
  ageSeconds: number;
}

export interface QuarantinePage extends PageInfo {
  items: QuarantineItem[];
}

export interface QuarantineQuery {
  limit?: number;
  cursor?: string;
}

export interface QuarantineReviewOutcome {
  record: MemoryRecord;
  provenance: Provenance;
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
