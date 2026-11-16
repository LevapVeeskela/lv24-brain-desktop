import { apiClient, toApiError } from "@/shared/api/client";
import {
  parseCatchup,
  parseProposalOutcome,
  parseProposalPage,
  parseRecordDetail,
  parseRecordPage,
  parseReview,
  parseSearchPage,
} from "./parsers";
import type {
  CatchupReport,
  ProposalDecision,
  ProposalListQuery,
  ProposalOutcome,
  ProposalPage,
  RecordDetail,
  RecordListQuery,
  RecordPage,
  ReviewReport,
  SearchPage,
  SearchRequest,
} from "../model/types";

export interface RecordDetailOptions {
  history?: boolean;
  maxTokens?: number;
}

export interface CatchupOptions {
  limit?: number;
  includeUnreviewed?: boolean;
}

export interface MemorySource {
  listRecords(projectId: string, query?: RecordListQuery): Promise<RecordPage>;
  getRecord(
    projectId: string,
    recordId: string,
    options?: RecordDetailOptions,
  ): Promise<RecordDetail>;
  search(request: SearchRequest): Promise<SearchPage>;
  review(projectId: string): Promise<ReviewReport>;
  listProposals(
    projectId: string,
    query?: ProposalListQuery,
  ): Promise<ProposalPage>;
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
          project: projectId,
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
    const { data, error, response } = await apiClient.GET(
      "/v1/records/{id}",
      {
        params: {
          path: { id: recordId },
          query: {
            project: projectId,
            history: options.history,
            max_tokens: options.maxTokens,
          },
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseRecordDetail(data);
  },

  async search(request) {
    const { data, error, response } = await apiClient.GET("/v1/search", {
      params: {
        query: {
          q: request.query,
          project: request.projectId,
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

  async review(projectId) {
    const { data, error, response } = await apiClient.GET("/v1/review", {
      params: { query: { project: projectId } },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseReview(data);
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
        },
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseProposalPage(data);
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
