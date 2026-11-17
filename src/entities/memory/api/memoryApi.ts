import { apiClient, toApiError } from "@/shared/api/client";
import {
  parseCatchup,
  parseProposalDetail,
  parseProposalOutcome,
  parseProposalPage,
  parseProposalSnoozeReceipt,
  parseMemoryRecord,
  parseQuarantinePage,
  parseRecordDetail,
  parseRecordPage,
  parseReview,
  parseReviewFixResult,
  parseSearchPage,
} from "./parsers";
import type {
  CatchupReport,
  MemoryRecord,
  ProposalDecision,
  ProposalDetail,
  ProposalListQuery,
  ProposalOutcome,
  ProposalPage,
  ProposalSnoozeReceipt,
  QuarantinePage,
  QuarantineQuery,
  RecordDetail,
  RecordEditPatch,
  RecordListQuery,
  RecordPage,
  RecordReviewRequest,
  ReviewFixRequest,
  ReviewFixResult,
  ReviewReport,
  SearchPage,
  SearchRequest,
} from "../model/types";

export interface RecordDetailOptions {
  history?: boolean;
  maxTokens?: number;
}

export interface ProposalSnoozeInput {
  until?: string | Date | null;
  expectedUpdatedAt?: string;
  expected_updated_at?: string;
}

export interface CatchupOptions {
  limit?: number;
  includeUnreviewed?: boolean;
}

export interface ReviewOptions {
  allProjects?: boolean;
}

export interface MemorySource {
  listRecords(
    projectId: string | null,
    query?: RecordListQuery,
  ): Promise<RecordPage>;
  getRecord(
    projectId: string,
    recordId: string,
    options?: RecordDetailOptions,
  ): Promise<RecordDetail>;
  editRecord(
    projectId: string,
    recordId: string,
    patch: RecordEditPatch,
  ): Promise<RecordDetail>;
  trashRecord(projectId: string, recordId: string): Promise<MemoryRecord>;
  restoreRecord(projectId: string, recordId: string): Promise<MemoryRecord>;
  search(request: SearchRequest): Promise<SearchPage>;
  review(
    projectId: string | null,
    options?: ReviewOptions,
  ): Promise<ReviewReport>;
  reviewFix(
    projectId: string,
    request: ReviewFixRequest,
  ): Promise<ReviewFixResult>;
  reviewRecord(
    projectId: string,
    recordId: string,
    request: RecordReviewRequest,
  ): Promise<MemoryRecord>;
  listQuarantine(
    projectId: string,
    query?: QuarantineQuery,
  ): Promise<QuarantinePage>;
  listProposals(
    projectId: string,
    query?: ProposalListQuery,
  ): Promise<ProposalPage>;
  getProposal(
    projectId: string,
    proposalId: string,
    maxTokens?: number,
  ): Promise<ProposalDetail>;
  promote(
    projectId: string,
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<ProposalOutcome>;
  dismiss(
    projectId: string,
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<ProposalOutcome>;
  snoozeProposal?(
    projectId: string,
    proposalId: string,
    request?: ProposalSnoozeInput | string | Date | null,
  ): Promise<ProposalSnoozeReceipt>;
  snooze?(
    projectId: string,
    proposalId: string,
    request?: ProposalSnoozeInput | string | Date | null,
  ): Promise<ProposalSnoozeReceipt>;
  clearProposalSnooze?(
    projectId: string,
    proposalId: string,
    expectedUpdatedAt?: string | { expectedUpdatedAt?: string; expected_updated_at?: string },
  ): Promise<ProposalSnoozeReceipt>;
  clearSnooze?(
    projectId: string,
    proposalId: string,
    expectedUpdatedAt?: string | { expectedUpdatedAt?: string; expected_updated_at?: string },
  ): Promise<ProposalSnoozeReceipt>;
  unsnoozeProposal?(
    projectId: string,
    proposalId: string,
    expectedUpdatedAt?: string | { expectedUpdatedAt?: string; expected_updated_at?: string },
  ): Promise<ProposalSnoozeReceipt>;
  unsnooze?(
    projectId: string,
    proposalId: string,
    expectedUpdatedAt?: string | { expectedUpdatedAt?: string; expected_updated_at?: string },
  ): Promise<ProposalSnoozeReceipt>;
  catchup(projectId: string, options?: CatchupOptions): Promise<CatchupReport>;
}

export const memoryApi: MemorySource = {
  async listRecords(projectId, query = {}) {
    const { data, error, response } = await apiClient.GET("/v1/records", {
      params: {
        query: {
          project: query.allProjects ? undefined : (projectId ?? undefined),
          all_projects: query.allProjects || undefined,
          kind: query.kinds?.length ? query.kinds : undefined,
          status: query.status || undefined,
          scope: query.scope || undefined,
          subtype: query.subtype?.trim() || undefined,
          topic: query.topic?.trim() || undefined,
          since: query.since || undefined,
          limit: query.limit,
          cursor: query.cursor,
          due_review: query.dueReview || undefined,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordPage(data);
  },

  async getRecord(projectId, recordId, options = {}) {
    const { data, error, response } = await apiClient.GET("/v1/records/{id}", {
      params: {
        path: { id: recordId },
        query: {
          project: projectId,
          history: options.history,
          max_tokens: options.maxTokens,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordDetail(data);
  },

  async editRecord(projectId, recordId, patch) {
    const { data, error, response } = await apiClient.PATCH(
      "/v1/records/{id}",
      {
        params: {
          path: { id: recordId },
          query: { project: projectId },
        },
        body: recordEditBody(patch),
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordDetail(data);
  },

  async trashRecord(projectId, recordId) {
    const { data, error, response } = await apiClient.POST(
      "/v1/records/{id}/trash",
      {
        params: {
          path: { id: recordId },
          query: { project: projectId },
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordRow(data);
  },

  async restoreRecord(projectId, recordId) {
    const { data, error, response } = await apiClient.POST(
      "/v1/records/{id}/restore",
      {
        params: {
          path: { id: recordId },
          query: { project: projectId },
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordRow(data);
  },

  async search(request) {
    const { data, error, response } = await apiClient.GET("/v1/search", {
      params: {
        query: {
          q: request.query,
          project: request.allProjects
            ? undefined
            : (request.projectId ?? undefined),
          all_projects: request.allProjects || undefined,
          kind: request.filters.kinds.length
            ? request.filters.kinds
            : undefined,
          limit: request.limit,
          cursor: request.cursor,
          mode: request.filters.mode || undefined,
          min_score: request.filters.minScore ?? undefined,
          explain: request.filters.explain || undefined,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseSearchPage(data);
  },

  async review(projectId, options = {}) {
    const { data, error, response } = await apiClient.GET("/v1/review", {
      params: {
        query: {
          project: options.allProjects ? undefined : (projectId ?? undefined),
          all_projects: options.allProjects || undefined,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseReview(data);
  },

  async reviewFix(projectId, request) {
    const { data, error, response } = await apiClient.POST("/v1/review/fix", {
      params: { query: { project: projectId } },
      body: {
        dry_run: request.apply !== true,
        apply: request.apply === true,
        kinds: request.kinds?.length ? request.kinds : undefined,
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseReviewFixResult(data);
  },

  async listQuarantine(projectId, query = {}) {
    const { data, error, response } = await apiClient.GET("/v1/quarantine", {
      params: {
        query: {
          project: projectId,
          limit: query.limit,
          cursor: query.cursor,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseQuarantinePage(data);
  },

  async reviewRecord(
    projectId: string,
    recordId: string,
    request: RecordReviewRequest,
  ): Promise<MemoryRecord> {
    const { data, error, response } = await apiClient.POST(
      "/v1/records/{id}/review",
      {
        params: {
          path: { id: recordId },
          query: { project: projectId },
        },
        body: recordReviewBody(request),
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseMemoryRecord(data, "record review");
  },

  async listProposals(projectId, query = {}) {
    const { data, error, response } = await apiClient.GET("/v1/proposals", {
      params: {
        query: {
          project: projectId,
          status: query.statuses?.length ? query.statuses : undefined,
          kind: query.kind,
          limit: query.limit,
          cursor: query.cursor,
          include_body: query.includeBody || undefined,
          include_snoozed: query.includeSnoozed || undefined,
          max_tokens: query.maxTokens,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseProposalPage(data);
  },

  async getProposal(projectId, proposalId, maxTokens) {
    const { data, error, response } = await apiClient.GET(
      "/v1/proposals/{project}/{id}",
      {
        params: {
          path: { project: projectId, id: proposalId },
          query: { max_tokens: maxTokens },
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProposalDetail(data);
  },

  async promote(projectId, proposalId, decision) {
    const { data, error, response } = await apiClient.POST(
      "/v1/proposals/{project}/{id}/promote",
      {
        params: { path: { project: projectId, id: proposalId } },
        body: proposalDecisionBody(decision),
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProposalOutcome(data);
  },

  async dismiss(projectId, proposalId, decision) {
    const { data, error, response } = await apiClient.POST(
      "/v1/proposals/{project}/{id}/dismiss",
      {
        params: { path: { project: projectId, id: proposalId } },
        body: proposalDecisionBody(decision),
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProposalOutcome(data);
  },

  async snoozeProposal(projectId, proposalId, request = {}) {
    return snoozeProposalRequest(projectId, proposalId, request);
  },

  async snooze(projectId, proposalId, request = {}) {
    return snoozeProposalRequest(projectId, proposalId, request);
  },

  async clearProposalSnooze(projectId, proposalId, expectedUpdatedAt) {
    return clearSnoozeRequest(projectId, proposalId, expectedUpdatedAt);
  },

  async clearSnooze(projectId, proposalId, expectedUpdatedAt) {
    return clearSnoozeRequest(projectId, proposalId, expectedUpdatedAt);
  },

  async unsnoozeProposal(projectId, proposalId, expectedUpdatedAt) {
    return clearSnoozeRequest(projectId, proposalId, expectedUpdatedAt);
  },

  async unsnooze(projectId, proposalId, expectedUpdatedAt) {
    return clearSnoozeRequest(projectId, proposalId, expectedUpdatedAt);
  },

  async catchup(projectId, options = {}) {
    const { data, error, response } = await apiClient.GET("/v1/catchup", {
      params: {
        query: {
          project: projectId,
          limit: options.limit,
          include_unreviewed: options.includeUnreviewed || undefined,
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseCatchup(data);
  },
};

/** The wire contract is snake_case even though the UI uses camelCase. */
export function proposalDecisionBody(decision: ProposalDecision) {
  return {
    as: decision.as,
    status: decision.status,
    title: decision.title,
    force: decision.force,
    yes: decision.yes,
    allow_duplicate: decision.allowDuplicate,
    allow_protected: decision.allowProtected,
    dry_run: decision.dryRun,
  };
}

export function recordEditBody(patch: RecordEditPatch) {
  return {
    title: patch.title,
    body: patch.body,
    tags: patch.tags,
    expected_updated_at: patch.expectedUpdatedAt,
    allow_duplicate: patch.allowDuplicate || undefined,
  };
}

/** The wire contract is snake_case even though the UI uses camelCase. */
export function recordReviewBody(request: RecordReviewRequest) {
  return {
    reviewed: request.reviewed ?? true,
    trust: request.trust,
    expected_updated_at: request.expectedUpdatedAt,
  };
}

/** Trash and restore return a record row without body, links or history. */
function parseRecordRow(value: unknown): MemoryRecord {
  return parseMemoryRecord(value, "record");
}

function normalizeSnoozeUntil(value: unknown): { until: string | null; clear: boolean } {
  if (value === null || value === undefined) {
    return { until: null, clear: true };
  }
  if (value instanceof Date) {
    return { until: value.toISOString(), clear: false };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "null") {
      return { until: null, clear: true };
    }
    return { until: trimmed, clear: false };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("until" in obj) {
      return normalizeSnoozeUntil(obj.until);
    }
  }
  return { until: null, clear: false };
}

function normalizeExpectedUpdatedAt(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate =
      obj.expectedUpdatedAt ?? obj.expected_updated_at ?? obj.updatedAt ?? obj.updated_at;
    if (typeof candidate === "string") {
      return candidate.trim() || undefined;
    }
  }
  return undefined;
}

async function snoozeProposalRequest(
  projectId: string,
  proposalId: string,
  request: unknown,
): Promise<ProposalSnoozeReceipt> {
  let untilInput: unknown = null;
  let expectedUpdatedAt: string | undefined;
  if (typeof request === "string" || request instanceof Date || request === null) {
    untilInput = request;
  } else if (typeof request === "object" && request !== null) {
    const obj = request as Record<string, unknown>;
    untilInput = Object.prototype.hasOwnProperty.call(obj, "until")
      ? obj.until
      : obj;
    expectedUpdatedAt = normalizeExpectedUpdatedAt(obj);
  }
  const normalized = normalizeSnoozeUntil(untilInput);
  const body: Record<string, unknown> = { until: normalized.until };
  if (expectedUpdatedAt) {
    body.expected_updated_at = expectedUpdatedAt;
  }
  const { data, error, response } = await apiClient.POST(
    "/v1/proposals/{project}/{id}/snooze",
    {
      params: { path: { project: projectId, id: proposalId } },
      body: body as any,
    },
  );
  if (error) {
    throw toApiError(response, error);
  }
  return parseProposalSnoozeReceipt(data);
}

async function clearSnoozeRequest(
  projectId: string,
  proposalId: string,
  expectedUpdatedAt: unknown,
): Promise<ProposalSnoozeReceipt> {
  const expected = normalizeExpectedUpdatedAt(expectedUpdatedAt);
  const body: Record<string, unknown> = { until: null };
  if (expected) {
    body.expected_updated_at = expected;
  }
  const { data, error, response } = await apiClient.POST(
    "/v1/proposals/{project}/{id}/snooze",
    {
      params: { path: { project: projectId, id: proposalId } },
      body: body as any,
    },
  );
  if (error) {
    throw toApiError(response, error);
  }
  return parseProposalSnoozeReceipt(data);
}
