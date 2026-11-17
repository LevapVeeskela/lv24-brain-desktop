import { parseProjectState } from "@/entities/project/api/projectApi";
import {
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asObject,
  asOptionalBoolean,
  asOptionalEnum,
  asOptionalNumber,
  asOptionalString,
  asOptionalTimestamp,
  asString,
  asStringMap,
  asTimestamp,
} from "@/shared/api/validate";
import {
  FINDING_SEVERITIES,
  LINK_STATES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  PROVENANCE_ORIGINS,
  QUARANTINE_REASONS,
  RECORD_KINDS,
  RECORD_SCOPES,
  RELATION_STATUSES,
  REVIEW_FIX_ACTIONS,
  REVIEW_FIX_FIELDS,
  REVIEW_SOURCES,
  SEARCH_KINDS,
  TRUST_LEVELS,
  type Backlink,
  type CatchupReport,
  type DueReview,
  type Finding,
  type JournalEntry,
  type LinkState,
  type MemoryRecord,
  type PageInfo,
  type Proposal,
  type ProposalDetail,
  type ProposalOutcome,
  type ProposalPage,
  type ProposalSnoozeReceipt,
  type QuarantineItem,
  type QuarantinePage,
  type RecordDetail,
  type RecordHistory,
  type RecordLink,
  type RecordPage,
  type Relation,
  type ReviewFixChange,
  type ReviewFixResult,
  type ReviewReport,
  type SearchExplain,
  type SearchHit,
  type SearchPage,
} from "../model/types";

export function parsePageInfo(value: unknown, what: string): PageInfo {
  const page = asObject(value, what);
  return {
    page: asNumber(page.page, `${what}.page`),
    pageSize: asNumber(page.page_size, `${what}.page_size`),
    hasMore: asBoolean(page.has_more, `${what}.has_more`),
    nextCursor: asOptionalString(page.next_cursor, `${what}.next_cursor`),
  };
}

export function parseMemoryRecord(value: unknown, what = "record"): MemoryRecord {
  const record = asObject(value, what);
  return {
    id: asString(record.id, `${what}.id`),
    projectId: asString(record.project_id, `${what}.project_id`),
    kind: asEnum(record.kind, RECORD_KINDS, `${what}.kind`),
    title: asString(record.title, `${what}.title`),
    status: asOptionalString(record.status, `${what}.status`),
    path: asString(record.path, `${what}.path`),
    permalink: asOptionalString(record.permalink, `${what}.permalink`),
    subtype: asOptionalString(record.subtype, `${what}.subtype`),
    scope: asOptionalEnum(record.scope, RECORD_SCOPES, `${what}.scope`),
    topicKey: asOptionalString(record.topic_key, `${what}.topic_key`),
    occurrences: asOptionalNumber(record.occurrences, `${what}.occurrences`),
    tags:
      record.tags === undefined || record.tags === null
        ? undefined
        : asArray(record.tags, `${what}.tags`, (item, where) =>
            asString(item, where),
          ),
    createdAt: asOptionalTimestamp(record.created_at, `${what}.created_at`),
    updatedAt: asOptionalTimestamp(record.updated_at, `${what}.updated_at`),
    validity: parseValidity(record.validity, `${what}.validity`),
    provenance: parseProvenance(record.provenance, `${what}.provenance`),
    review: parseReviewState(record.review, `${what}.review`),
  };
}

function parseValidity(value: unknown, what: string): MemoryRecord["validity"] {
  const validity = asObject(value, what);
  return {
    validFrom: asOptionalTimestamp(validity.valid_from, `${what}.valid_from`),
    validTo: asOptionalTimestamp(validity.valid_to, `${what}.valid_to`),
    supersededBy: asOptionalString(
      validity.superseded_by,
      `${what}.superseded_by`,
    ),
    supersedes: asOptionalString(validity.supersedes, `${what}.supersedes`),
    confidence: asOptionalNumber(validity.confidence, `${what}.confidence`),
    current: asOptionalBoolean(validity.current, `${what}.current`) ?? false,
  };
}

function parseProvenance(
  value: unknown,
  what: string,
): MemoryRecord["provenance"] {
  const provenance = asObject(value, what);
  return {
    origin: asEnum(provenance.origin, PROVENANCE_ORIGINS, `${what}.origin`),
    trust: asEnum(provenance.trust, TRUST_LEVELS, `${what}.trust`),
    reviewed: asOptionalBoolean(provenance.reviewed, `${what}.reviewed`) ?? false,
    quarantined:
      asOptionalBoolean(provenance.quarantined, `${what}.quarantined`) ?? false,
    needsReview:
      asOptionalBoolean(provenance.needs_review, `${what}.needs_review`) ?? false,
  };
}

function parseReviewState(
  value: unknown,
  what: string,
): MemoryRecord["review"] {
  const review = asObject(value, what);
  return {
    reviewAfter: asOptionalTimestamp(
      review.review_after,
      `${what}.review_after`,
    ),
    reviewSource: asOptionalEnum(
      review.review_source,
      REVIEW_SOURCES,
      `${what}.review_source`,
    ),
    due: asOptionalBoolean(review.due, `${what}.due`) ?? false,
  };
}

export function parseRecordPage(value: unknown): RecordPage {
  const page = asObject(value, "record page");
  return {
    ...parsePageInfo(page, "record page"),
    items: readRecords(page.items, "record page.items"),
  };
}

function readRecords(value: unknown, what: string): MemoryRecord[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, what, (item, where) => parseMemoryRecord(item, where));
}

export function parseRecordDetail(value: unknown): RecordDetail {
  const detail = asObject(value, "record detail");
  return {
    ...parseMemoryRecord(detail, "record detail"),
    body: asString(detail.body, "record detail.body"),
    bodyTruncated: asBoolean(
      detail.body_truncated,
      "record detail.body_truncated",
    ),
    bodyTokens: asNumber(detail.body_tokens, "record detail.body_tokens"),
    maxTokens: asNumber(detail.max_tokens, "record detail.max_tokens"),
    links: readLinks(detail.links),
    backlinks: readBacklinks(detail.backlinks),
    relations: readRelations(detail.relations),
    history:
      detail.history === undefined || detail.history === null
        ? undefined
        : parseRecordHistory(detail.history),
  };
}

function readLinks(value: unknown): RecordLink[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, "record detail.links", (item, what) => {
    const link = asObject(item, what);
    return {
      field: asString(link.field, `${what}.field`),
      ref: asString(link.ref, `${what}.ref`),
      text: asOptionalString(link.text, `${what}.text`),
      projectId: asOptionalString(link.project_id, `${what}.project_id`),
      id: asOptionalString(link.id, `${what}.id`),
      state: asEnum(link.state, LINK_STATES, `${what}.state`) as LinkState,
      detail: asOptionalString(link.detail, `${what}.detail`),
      target:
        link.target === undefined || link.target === null
          ? undefined
          : parseMemoryRecord(link.target, `${what}.target`),
    };
  });
}

function readBacklinks(value: unknown): Backlink[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, "record detail.backlinks", (item, what) => {
    const backlink = asObject(item, what);
    return {
      field: asString(backlink.field, `${what}.field`),
      source: parseMemoryRecord(backlink.source, `${what}.source`),
    };
  });
}

function readRelations(value: unknown): Relation[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, "record detail.relations", (item, what) => {
    const relation = asObject(item, what);
    return {
      target: asString(relation.target, `${what}.target`),
      targetKind: asOptionalEnum(
        relation.target_kind,
        RECORD_KINDS,
        `${what}.target_kind`,
      ),
      relation: asString(relation.relation, `${what}.relation`),
      reason: asOptionalString(relation.reason, `${what}.reason`),
      confidence: asOptionalNumber(relation.confidence, `${what}.confidence`),
      status: asEnum(
        relation.status,
        RELATION_STATUSES,
        `${what}.status`,
      ),
      judgedAt: asOptionalTimestamp(relation.judged_at, `${what}.judged_at`),
      verdictBy: asOptionalString(relation.verdict_by, `${what}.verdict_by`),
    };
  });
}

function parseRecordHistory(value: unknown): RecordHistory {
  const history = asObject(value, "record history");
  return {
    records: readRecords(history.records, "record history.records"),
    anchorIndex: asNumber(history.anchor_index, "record history.anchor_index"),
    before: asNumber(history.before, "record history.before"),
    after: asNumber(history.after, "record history.after"),
    total: asNumber(history.total, "record history.total"),
  };
}

export function parseSearchPage(value: unknown): SearchPage {
  const page = asObject(value, "search page");
  return {
    ...parsePageInfo(page, "search page"),
    query: asString(page.query, "search page.query"),
    relaxed: asBoolean(page.relaxed, "search page.relaxed"),
    notice: asOptionalString(page.notice, "search page.notice"),
    hits: asArray(page.hits, "search page.hits", (item, what) =>
      parseSearchHit(item, what),
    ),
  };
}

function parseSearchHit(value: unknown, what: string): SearchHit {
  const hit = asObject(value, what);
  return {
    id: asString(hit.id, `${what}.id`),
    projectId: asString(hit.project_id, `${what}.project_id`),
    kind: asEnum(hit.kind, SEARCH_KINDS, `${what}.kind`),
    title: asString(hit.title, `${what}.title`),
    preview: asString(hit.preview, `${what}.preview`),
    score: asNumber(hit.score, `${what}.score`),
    subtype: asOptionalString(hit.subtype, `${what}.subtype`),
    scope: asOptionalString(hit.scope, `${what}.scope`),
    topicKey: asOptionalString(hit.topic_key, `${what}.topic_key`),
    occurrences: asOptionalNumber(hit.occurrences, `${what}.occurrences`),
    validFrom: asOptionalTimestamp(hit.valid_from, `${what}.valid_from`),
    validTo: asOptionalTimestamp(hit.valid_to, `${what}.valid_to`),
    supersededBy: asOptionalString(
      hit.superseded_by,
      `${what}.superseded_by`,
    ),
    matchReasons:
      hit.match_reasons === undefined || hit.match_reasons === null
        ? []
        : asArray(hit.match_reasons, `${what}.match_reasons`, (reason, where) =>
            asString(reason, where),
          ),
    explain:
      hit.explain === undefined || hit.explain === null
        ? undefined
        : parseSearchExplain(hit.explain, `${what}.explain`),
  };
}

function parseSearchExplain(value: unknown, what: string): SearchExplain {
  const explain = asObject(value, what);
  return {
    bm25: asNumber(explain.bm25, `${what}.bm25`),
    recency: asNumber(explain.recency, `${what}.recency`),
    importance: asNumber(explain.importance, `${what}.importance`),
    pin: asNumber(explain.pin, `${what}.pin`),
    link: asNumber(explain.link, `${what}.link`),
  };
}

export function parseReview(value: unknown): ReviewReport {
  const review = asObject(value, "review");
  const proposals = asObject(review.proposals, "review.proposals");
  return {
    projectId: asString(review.project_id, "review.project_id"),
    projectIds:
      review.project_ids === undefined || review.project_ids === null
        ? []
        : asArray(review.project_ids, "review.project_ids", (item, where) =>
            asString(item, where),
          ),
    allProjects:
      asOptionalBoolean(review.all_projects, "review.all_projects") ?? false,
    findings: asArray(review.findings, "review.findings", (item, what) =>
      parseFinding(item, what),
    ),
    dueReviews: asArray(
      review.due_reviews,
      "review.due_reviews",
      (item, what) => parseDueReview(item, what),
    ),
    proposals: asArray(proposals.items, "review.proposals.items", (item, what) =>
      parseProposal(item, what),
    ),
    pendingCount: asNumber(
      proposals.pending_count,
      "review.proposals.pending_count",
    ),
    snoozedCount: asNumber(
      proposals.snoozed_count,
      "review.proposals.snoozed_count",
    ),
    quarantinedCount: asNumber(
      review.quarantined_count,
      "review.quarantined_count",
    ),
    findingsTruncated:
      asOptionalBoolean(
        review.findings_truncated,
        "review.findings_truncated",
      ) ?? false,
    dueReviewsTruncated:
      asOptionalBoolean(
        review.due_reviews_truncated,
        "review.due_reviews_truncated",
      ) ?? false,
    proposalsTruncated:
      asOptionalBoolean(
        review.proposals_truncated,
        "review.proposals_truncated",
      ) ?? false,
  };
}

function parseFinding(value: unknown, what: string): Finding {
  const finding = asObject(value, what);
  return {
    projectId: asOptionalString(finding.project_id, `${what}.project_id`),
    kind: asString(finding.kind, `${what}.kind`),
    severity: asEnum(finding.severity, FINDING_SEVERITIES, `${what}.severity`),
    message: asString(finding.message, `${what}.message`),
    why: asString(finding.why, `${what}.why`),
    next: asString(finding.next, `${what}.next`),
    confirm: asString(finding.confirm, `${what}.confirm`),
    evidence: asOptionalString(finding.evidence, `${what}.evidence`),
    fixable: asOptionalBoolean(finding.fixable, `${what}.fixable`) ?? false,
    fix: asOptionalString(finding.fix, `${what}.fix`),
  };
}

function parseDueReview(value: unknown, what: string): DueReview {
  const due = asObject(value, what);
  return {
    projectId: asOptionalString(due.project_id, `${what}.project_id`),
    kind: asString(due.kind, `${what}.kind`),
    id: asString(due.id, `${what}.id`),
    title: asString(due.title, `${what}.title`),
    reviewAfter: asTimestamp(due.review_after, `${what}.review_after`),
    overdueSeconds: asNumber(due.overdue_seconds, `${what}.overdue_seconds`),
    source: asString(due.source, `${what}.source`),
  };
}

export function parseProposalPage(value: unknown): ProposalPage {
  const page = asObject(value, "proposal page");
  return {
    ...parsePageInfo(page, "proposal page"),
    items: asArray(page.items, "proposal page.items", (item, what) =>
      parseProposal(item, what),
    ),
    total: asNumber(page.total, "proposal page.total"),
  };
}

export function parseProposal(value: unknown, what = "proposal"): Proposal {
  const proposal = asObject(value, what);
  return {
    id: asString(proposal.id, `${what}.id`),
    projectId: asString(proposal.project_id, `${what}.project_id`),
    externalId: asOptionalString(proposal.external_id, `${what}.external_id`),
    kind: asEnum(proposal.kind, PROPOSAL_KINDS, `${what}.kind`),
    title: asString(proposal.title, `${what}.title`),
    rule: asOptionalString(proposal.rule, `${what}.rule`),
    confidence: asNumber(proposal.confidence, `${what}.confidence`),
    status: asEnum(proposal.status, PROPOSAL_STATUSES, `${what}.status`),
    connectionId: asString(proposal.connection_id, `${what}.connection_id`),
    createdAt: asOptionalTimestamp(proposal.created_at, `${what}.created_at`),
    updatedAt: asOptionalTimestamp(proposal.updated_at, `${what}.updated_at`),
    sourceStale:
      asOptionalBoolean(proposal.source_stale, `${what}.source_stale`) ?? false,
    sourceOrphan:
      asOptionalBoolean(proposal.source_orphan, `${what}.source_orphan`) ??
      false,
    localOnly:
      asOptionalBoolean(proposal.local_only, `${what}.local_only`) ?? false,
    sourceHealth: asOptionalString(
      proposal.source_health,
      `${what}.source_health`,
    ),
    snoozed: asOptionalBoolean(proposal.snoozed, `${what}.snoozed`),
    snoozedUntil: asOptionalTimestamp(
      proposal.snoozed_until,
      `${what}.snoozed_until`,
    ),
    body: asOptionalString(proposal.body, `${what}.body`),
    bodyTruncated: asOptionalBoolean(
      proposal.body_truncated,
      `${what}.body_truncated`,
    ),
    bodyTokens: asOptionalNumber(
      proposal.body_tokens,
      `${what}.body_tokens`,
    ),
    maxTokens: asOptionalNumber(proposal.max_tokens, `${what}.max_tokens`),
    bodyOmitted:
      asOptionalBoolean(proposal.body_omitted, `${what}.body_omitted`) ??
      false,
  };
}

export function parseProposalDetail(value: unknown): ProposalDetail {
  const proposal = asObject(value, "proposal detail");
  return {
    id: asString(proposal.id, "proposal detail.id"),
    projectId: asString(proposal.project_id, "proposal detail.project_id"),
    kind: asEnum(
      proposal.kind,
      PROPOSAL_KINDS,
      "proposal detail.kind",
    ),
    title: asString(proposal.title, "proposal detail.title"),
    status: asString(proposal.status, "proposal detail.status"),
    body: asString(proposal.body, "proposal detail.body"),
    bodyTruncated: asBoolean(
      proposal.body_truncated,
      "proposal detail.body_truncated",
    ),
    bodyTokens: asNumber(proposal.body_tokens, "proposal detail.body_tokens"),
    maxTokens: asNumber(proposal.max_tokens, "proposal detail.max_tokens"),
  };
}

export function parseReviewFixResult(value: unknown): ReviewFixResult {
  const result = asObject(value, "review fix");
  return {
    projectId: asString(result.project_id, "review fix.project_id"),
    dryRun: asBoolean(result.dry_run, "review fix.dry_run"),
    findings: asArray(result.findings, "review fix.findings", (item, what) =>
      parseFinding(item, what),
    ),
    changes: asArray(result.changes, "review fix.changes", (item, what) =>
      parseReviewFixChange(item, what),
    ),
  };
}

function parseReviewFixChange(
  value: unknown,
  what: string,
): ReviewFixChange {
  const change = asObject(value, what);
  return {
    kind: asString(change.kind, `${what}.kind`),
    action: asEnum(change.action, REVIEW_FIX_ACTIONS, `${what}.action`),
    field: asEnum(change.field, REVIEW_FIX_FIELDS, `${what}.field`),
    value: asString(change.value, `${what}.value`),
    evidence: asOptionalString(change.evidence, `${what}.evidence`),
  };
}

export function parseQuarantinePage(value: unknown): QuarantinePage {
  const page = asObject(value, "quarantine page");
  return {
    ...parsePageInfo(page, "quarantine page"),
    items: asArray(page.items, "quarantine page.items", (item, what) =>
      parseQuarantineItem(item, what),
    ),
  };
}

function parseQuarantineItem(value: unknown, what: string): QuarantineItem {
  const item = asObject(value, what);
  return {
    id: asString(item.id, `${what}.id`),
    kind: asEnum(item.kind, RECORD_KINDS, `${what}.kind`),
    projectId: asString(item.project_id, `${what}.project_id`),
    title: asString(item.title, `${what}.title`),
    reason: asEnum(item.reason, QUARANTINE_REASONS, `${what}.reason`),
    origin: asOptionalString(item.origin, `${what}.origin`),
    trust: asOptionalString(item.trust, `${what}.trust`),
    createdAt: asOptionalTimestamp(item.created_at, `${what}.created_at`),
    ageSeconds: asNumber(item.age_seconds, `${what}.age_seconds`),
  };
}

export function parseProposalOutcome(value: unknown): ProposalOutcome {
  const outcome = asObject(value, "proposal outcome");
  return {
    projectId: asString(outcome.project_id, "proposal outcome.project_id"),
    proposalId: asString(outcome.proposal_id, "proposal outcome.proposal_id"),
    proposalStatus: asString(
      outcome.proposal_status,
      "proposal outcome.proposal_status",
    ),
    recordKind: asOptionalString(
      outcome.record_kind,
      "proposal outcome.record_kind",
    ),
    recordId: asOptionalString(outcome.record_id, "proposal outcome.record_id"),
    recordTitle: asOptionalString(
      outcome.record_title,
      "proposal outcome.record_title",
    ),
    already: asOptionalBoolean(outcome.already, "proposal outcome.already") ?? false,
    dismissed:
      asOptionalBoolean(outcome.dismissed, "proposal outcome.dismissed") ?? false,
    dryRun: asOptionalBoolean(outcome.dry_run, "proposal outcome.dry_run") ?? false,
  };
}

export function parseProposalSnoozeReceipt(value: unknown): ProposalSnoozeReceipt {
  const receipt = asObject(value, "proposal snooze receipt");
  return {
    projectId: asString(receipt.project_id, "proposal snooze receipt.project_id"),
    proposalId: asString(
      receipt.proposal_id,
      "proposal snooze receipt.proposal_id",
    ),
    status: asString(receipt.status, "proposal snooze receipt.status"),
    snoozed: asBoolean(receipt.snoozed, "proposal snooze receipt.snoozed"),
    snoozedUntil: asOptionalTimestamp(
      receipt.snoozed_until,
      "proposal snooze receipt.snoozed_until",
    ),
    updatedAt: asOptionalTimestamp(
      receipt.updated_at,
      "proposal snooze receipt.updated_at",
    ),
  };
}

export function parseCatchup(value: unknown): CatchupReport {
  const catchup = asObject(value, "catchup");
  const project = asObject(catchup.project, "catchup.project");
  return {
    project: {
      id: asString(project.id, "catchup.project.id"),
      name: asString(project.name, "catchup.project.name"),
    },
    since: asTimestamp(catchup.since, "catchup.since"),
    sinceSource: asEnum(
      catchup.since_source,
      ["handoff", "explicit", "default"] as const,
      "catchup.since_source",
    ),
    baselineHandoffId: asOptionalString(
      catchup.baseline_handoff_id,
      "catchup.baseline_handoff_id",
    ),
    notes: readRecords(catchup.notes, "catchup.notes"),
    decisions: readRecords(catchup.decisions, "catchup.decisions"),
    attempts: readRecords(catchup.attempts, "catchup.attempts"),
    handoffs: readRecords(catchup.handoffs, "catchup.handoffs"),
    journal: asArray(catchup.journal, "catchup.journal", (item, what) =>
      parseJournalEntry(item, what),
    ),
    quarantinedCount: asNumber(
      catchup.quarantined_count,
      "catchup.quarantined_count",
    ),
    includeUnreviewed:
      asOptionalBoolean(
        catchup.include_unreviewed,
        "catchup.include_unreviewed",
      ) ?? false,
    state: parseProjectState(catchup.state),
  };
}

function parseJournalEntry(value: unknown, what: string): JournalEntry {
  const entry = asObject(value, what);
  return {
    time: asTimestamp(entry.time, `${what}.time`),
    event: asString(entry.event, `${what}.event`),
    project: asOptionalString(entry.project, `${what}.project`),
    id: asOptionalString(entry.id, `${what}.id`),
    title: asOptionalString(entry.title, `${what}.title`),
    fields:
      entry.fields === undefined || entry.fields === null
        ? undefined
        : asStringMap(entry.fields, `${what}.fields`),
  };
}
