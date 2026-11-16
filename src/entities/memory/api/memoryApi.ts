import { apiClient, toApiError } from "@/shared/api/client";
import {
  parseCatchup,
  parseProposalDetail,
  parseProposalOutcome,
  parseProposalPage,
  parseMemoryRecord,
  parseQuarantinePage,
  parseQuarantineReview,
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
  QuarantinePage,
  QuarantineQuery,
  QuarantineReviewOutcome,
  RecordDetail,
  RecordEditPatch,
  RecordListQuery,
  RecordPage,
  ReviewFixRequest,
  ReviewFixResult,
  ReviewReport,
  SearchPage,
  SearchRequest,
  TrustLevel,
} from "../model/types";

export interface RecordDetailOptions {
  history?: boolean;
  maxTokens?: number;
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
  listQuarantine(
    projectId: string,
    query?: QuarantineQuery,
  ): Promise<QuarantinePage>;
  reviewQuarantine(
    projectId: string,
    recordId: string,
    trust?: TrustLevel,
  ): Promise<QuarantineReviewOutcome>;
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

  async reviewQuarantine(projectId, recordId, trust) {
    const { data, error, response } = await apiClient.POST(
      "/v1/quarantine/{id}/review",
      {
        params: {
          path: { id: recordId },
          query: { project: projectId },
        },
        body: trust ? { trust } : {},
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseQuarantineReview(data);
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

/** Trash and restore return a record row without body, links or history. */
function parseRecordRow(value: unknown): MemoryRecord {
  return parseMemoryRecord(value, "record");
}
