import { describe, expect, it } from "vitest";
import {
  parseCatchup,
  parseProposalOutcome,
  parseProposalPage,
  parseRecordDetail,
  parseRecordPage,
  parseReview,
  parseSearchPage,
} from "./parsers";

const record = {
  id: "dec-1",
  project_id: "lv24",
  kind: "decision",
  title: "Use SQLite FTS5",
  status: "accepted",
  path: "projects/lv24/memory/dec-1.md",
  validity: { current: true, confidence: 0.9, extra: "ignored" },
  provenance: {
    origin: "agent",
    trust: "verified",
    reviewed: true,
    quarantined: false,
    needs_review: false,
  },
  review: { due: false, review_source: "default" },
  updated_at: "2026-11-16T05:30:00Z",
  unknown_field: "stripped",
};

const page = {
  page: 1,
  page_size: 25,
  has_more: true,
  next_cursor: "cursor-2",
  items: [record],
};

describe("memory response parsers", () => {
  it("maps record pages to camelCase and strips unknown fields", () => {
    const parsed = parseRecordPage(page);
    expect(parsed.items[0]).toMatchObject({
      id: "dec-1",
      projectId: "lv24",
      kind: "decision",
      title: "Use SQLite FTS5",
      status: "accepted",
    });
    expect(parsed.items[0]).not.toHaveProperty("unknown_field");
    expect(parsed.items[0].validity).not.toHaveProperty("extra");
    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextCursor).toBe("cursor-2");
  });

  it("rejects malformed records and timestamps", () => {
    expect(() =>
      parseRecordPage({ ...page, items: [{ ...record, kind: "dump" }] }),
    ).toThrow(/kind/);
    expect(() =>
      parseRecordPage({ ...page, items: [{ ...record, updated_at: "yesterday" }] }),
    ).toThrow(/timestamp/);
    expect(() => parseRecordPage({ items: [] })).toThrow(/page/);
  });

  it("parses detail collections and history", () => {
    const detail = parseRecordDetail({
      ...record,
      body: "body",
      body_truncated: false,
      body_tokens: 10,
      max_tokens: 4000,
      links: [
        {
          field: "supersedes",
          ref: "dec-0",
          id: "dec-0",
          state: "found",
          target: { ...record, id: "dec-0" },
        },
      ],
      backlinks: [{ field: "supersedes", source: { ...record, id: "dec-2" } }],
      relations: [
        {
          target: "dec-3",
          relation: "supports",
          status: "pending",
          confidence: 0.4,
        },
      ],
      history: {
        records: [record],
        anchor_index: 0,
        before: 0,
        after: 0,
        total: 1,
      },
    });
    expect(detail.links[0].target?.id).toBe("dec-0");
    expect(detail.backlinks[0].source.id).toBe("dec-2");
    expect(detail.relations[0].relation).toBe("supports");
    expect(detail.history?.anchorIndex).toBe(0);
  });

  it("parses search pages with optional explain data", () => {
    const parsed = parseSearchPage({
      ...page,
      query: "sqlite",
      relaxed: true,
      hits: [
        {
          id: "dec-1",
          project_id: "lv24",
          kind: "decision",
          title: "Use SQLite FTS5",
          preview: "…",
          score: 0.82,
          match_reasons: ["title"],
          explain: {
            bm25: 1,
            recency: 0.2,
            importance: 0.3,
            pin: 0,
            link: 0.1,
          },
        },
      ],
    });
    expect(parsed.query).toBe("sqlite");
    expect(parsed.relaxed).toBe(true);
    expect(parsed.hits[0].explain?.bm25).toBe(1);
  });

  it("parses the review report, proposals and receipts", () => {
    const review = parseReview({
      project_id: "lv24",
      findings: [
        {
          kind: "stale-next",
          severity: "warn",
          message: "Next action is stale",
          why: "It is old",
          next: "Update it",
          confirm: "Is it still true?",
          fixable: true,
        },
      ],
      due_reviews: [
        {
          kind: "proposal",
          id: "prop-1",
          title: "Candidate",
          review_after: "2026-11-01T00:00:00Z",
          overdue_seconds: 3600,
          source: "default",
        },
      ],
      proposals: {
        pending_count: 1,
        items: [
          {
            id: "prop-1",
            project_id: "lv24",
            kind: "decision",
            title: "Candidate",
            confidence: 0.4,
            status: "stale",
            connection_id: "github-main",
            source_stale: true,
            source_orphan: false,
            local_only: false,
          },
        ],
      },
      quarantined_count: 2,
    });
    expect(review.findings[0].severity).toBe("warn");
    expect(review.proposals[0].sourceStale).toBe(true);
    expect(review.quarantinedCount).toBe(2);

    const proposalPage = parseProposalPage({
      ...page,
      total: 1,
      items: [
        {
          id: "prop-1",
          project_id: "lv24",
          kind: "decision",
          title: "Candidate",
          confidence: 0.4,
          status: "pending",
          connection_id: "github-main",
          source_stale: false,
          source_orphan: false,
          local_only: false,
        },
      ],
    });
    expect(proposalPage.total).toBe(1);

    const outcome = parseProposalOutcome({
      project_id: "lv24",
      proposal_id: "prop-1",
      proposal_status: "promoted",
      record_kind: "decision",
      record_id: "dec-9",
      already: false,
      dismissed: false,
      dry_run: false,
    });
    expect(outcome.recordId).toBe("dec-9");
  });

  it("parses catchup with the project state snapshot", () => {
    const catchup = parseCatchup({
      project: { id: "lv24", name: "LV24" },
      since: "2026-11-16T05:00:00Z",
      since_source: "handoff",
      state: {
        project_id: "lv24",
        revision: "rev-1",
        goal: "Ship",
        active: [],
      },
      notes: [record],
      decisions: [],
      attempts: [],
      handoffs: [],
      journal: [],
      quarantined_count: 0,
      include_unreviewed: false,
    });
    expect(catchup.project.id).toBe("lv24");
    expect(catchup.state.revision).toBe("rev-1");
    expect(catchup.notes[0].kind).toBe("decision");
  });
});
