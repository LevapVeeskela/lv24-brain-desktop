import { describe, expect, it } from "vitest";
import {
  parseCatchup,
  parseProposalDetail,
  parseProposalOutcome,
  parseProposalPage,
  parseQuarantinePage,
  parseRecordDetail,
  parseRecordPage,
  parseReview,
  parseReviewFixResult,
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

  it("keeps a live relation target kind for deep links", () => {
    const detail = parseRecordDetail({
      ...record,
      body: "body",
      body_truncated: false,
      body_tokens: 1,
      max_tokens: 4000,
      links: [],
      backlinks: [],
      relations: [
        {
          target: "dec-3",
          target_kind: "decision",
          relation: "supports",
          status: "accepted",
        },
        {
          target: "gone-1",
          relation: "supersedes",
          status: "pending",
        },
      ],
    });
    expect(detail.relations[0].targetKind).toBe("decision");
    expect(detail.relations[1].targetKind).toBeUndefined();
    expect(() =>
      parseRecordDetail({
        ...record,
        body: "body",
        body_truncated: false,
        body_tokens: 1,
        max_tokens: 4000,
        links: [],
        backlinks: [],
        relations: [
          {
            target: "dec-3",
            target_kind: "dump",
            relation: "supports",
            status: "accepted",
          },
        ],
      }),
    ).toThrow(/target_kind/);
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
        snoozed_count: 0,
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
    expect(review.findings[0].projectId).toBeUndefined();
    expect(review.allProjects).toBe(false);
    expect(review.proposals[0].sourceStale).toBe(true);
    expect(review.quarantinedCount).toBe(2);
    expect(review.findingsTruncated).toBe(false);

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

  it("parses an all-projects review with scoped rows and caps", () => {
    const review = parseReview({
      project_id: "*",
      project_ids: ["alpha", "beta"],
      all_projects: true,
      findings: [
        {
          project_id: "beta",
          kind: "stale-next",
          severity: "warn",
          message: "Next action is stale",
          why: "It is old",
          next: "Update it",
          confirm: "Is it still true?",
          fixable: false,
        },
      ],
      due_reviews: [
        {
          project_id: "alpha",
          kind: "note",
          id: "note-1",
          title: "Note",
          review_after: "2026-11-01T00:00:00Z",
          overdue_seconds: 60,
          source: "default",
        },
      ],
      proposals: { pending_count: 0, snoozed_count: 0, items: [] },
      quarantined_count: 4,
      findings_truncated: true,
      due_reviews_truncated: true,
      proposals_truncated: true,
    });
    expect(review.projectId).toBe("*");
    expect(review.projectIds).toEqual(["alpha", "beta"]);
    expect(review.allProjects).toBe(true);
    expect(review.findings[0].projectId).toBe("beta");
    expect(review.dueReviews[0].projectId).toBe("alpha");
    expect(review.findingsTruncated).toBe(true);
    expect(review.dueReviewsTruncated).toBe(true);
    expect(review.proposalsTruncated).toBe(true);
  });

  it("parses proposal bodies, the detail route and the safe-fix result", () => {
    const list = parseProposalPage({
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
          body: "Use FTS5.",
          body_truncated: true,
          body_tokens: 12,
          max_tokens: 600,
        },
        {
          id: "prop-2",
          project_id: "lv24",
          kind: "note",
          title: "Omitted",
          confidence: 0.2,
          status: "pending",
          connection_id: "github-main",
          source_stale: false,
          source_orphan: false,
          local_only: false,
          body_omitted: true,
        },
      ],
    });
    expect(list.items[0].body).toBe("Use FTS5.");
    expect(list.items[0].bodyTruncated).toBe(true);
    expect(list.items[0].maxTokens).toBe(600);
    expect(list.items[1].bodyOmitted).toBe(true);

    const detail = parseProposalDetail({
      id: "prop-1",
      project_id: "lv24",
      kind: "decision",
      title: "Candidate",
      status: "pending",
      body: "Use FTS5.",
      body_truncated: false,
      body_tokens: 3,
      max_tokens: 2000,
    });
    expect(detail.projectId).toBe("lv24");
    expect(detail.maxTokens).toBe(2000);

    const fix = parseReviewFixResult({
      project_id: "lv24",
      dry_run: false,
      findings: [
        {
          kind: "stale-next",
          severity: "warn",
          message: "Next action is stale",
          why: "old",
          next: "Update",
          confirm: "?",
          fixable: true,
          fix: "set_next_action",
        },
      ],
      changes: [
        {
          kind: "stale-next",
          action: "set_next_action",
          field: "next_action",
          value: "Ship 1.2",
          evidence: "handoff-2",
        },
      ],
      state: { project_id: "lv24", revision: "rev-2", goal: "Ship" },
    });
    expect(fix.dryRun).toBe(false);
    expect(fix.changes[0].action).toBe("set_next_action");
    expect(fix.changes[0].evidence).toBe("handoff-2");
    expect(() =>
      parseReviewFixResult({
        project_id: "lv24",
        dry_run: false,
        findings: [],
        changes: [
          {
            kind: "stale-next",
            action: "semantic",
            field: "next_action",
            value: "x",
          },
        ],
      }),
    ).toThrow(/action/);
  });

  it("parses quarantine pages and the review receipt", () => {
    const quarantine = parseQuarantinePage({
      page: 1,
      page_size: 25,
      has_more: true,
      next_cursor: "q-2",
      items: [
        {
          id: "note-q1",
          kind: "note",
          project_id: "lv24",
          title: "External note",
          reason: "unreviewed",
          origin: "connector",
          trust: "stated",
          created_at: "2026-11-16T05:00:00Z",
          age_seconds: 7200,
        },
        {
          id: "note-q2",
          kind: "note",
          project_id: "lv24",
          title: "Unknown",
          reason: "unknown_origin",
          age_seconds: 60,
        },
      ],
    });
    expect(quarantine.nextCursor).toBe("q-2");
    expect(quarantine.items[0].ageSeconds).toBe(7200);
    expect(quarantine.items[1].reason).toBe("unknown_origin");
    expect(() =>
      parseQuarantinePage({
        page: 1,
        page_size: 25,
        has_more: false,
        items: [
          {
            id: "note-q1",
            kind: "note",
            project_id: "lv24",
            title: "External note",
            reason: "malformed",
            age_seconds: 1,
          },
        ],
      }),
    ).toThrow(/reason/);

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
        provenance: {
          origin: "human",
          trust: "verified",
          reviewed: true,
          quarantined: false,
          needs_review: false,
        },
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
