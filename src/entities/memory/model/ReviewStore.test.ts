import { describe, expect, it, vi } from "vitest";
import { deferred, memorySource } from "@/test/api";
import {
  proposal,
  proposalDetail,
  proposalOutcome,
  proposalPage,
  reviewFixResult,
  reviewReport,
} from "@/test/fixtures";
import { ReviewStore } from "./ReviewStore";

describe("ReviewStore", () => {
  it("loads a report and exposes pending and quarantine counts", async () => {
    const store = new ReviewStore(
      memorySource({
        review: async () =>
          reviewReport([proposal(), proposal({ id: "prop-2" })], {
            quarantinedCount: 3,
          }),
      }),
    );
    await store.load("lv24");
    expect(store.loaded).toBe(true);
    expect(store.proposals).toHaveLength(2);
    expect(store.pendingCount).toBe(2);
    expect(store.quarantinedCount).toBe(3);
  });

  it("clears the previous project report while the next one loads", async () => {
    const next = deferred<ReturnType<typeof reviewReport>>();
    const review = vi
      .fn()
      .mockResolvedValueOnce(reviewReport([proposal()]))
      .mockReturnValueOnce(next.promise);
    const store = new ReviewStore(memorySource({ review }));
    await store.load("alpha");
    expect(store.proposals).toHaveLength(1);
    store.setProject("beta");
    expect(store.report).toBeNull();
    expect(store.loaded).toBe(false);
    const loading = store.load("beta");
    expect(store.loading).toBe(true);
    next.resolve(reviewReport([], { projectId: "beta" }));
    await loading;
    expect(store.report?.projectId).toBe("beta");
  });

  it("removes a promoted proposal optimistically and refreshes after success", async () => {
    let resolvePromote!: (value: ReturnType<typeof proposalOutcome>) => void;
    const promote = vi.fn(
      () =>
        new Promise<ReturnType<typeof proposalOutcome>>((resolve) => {
          resolvePromote = resolve;
        }),
    );
    const review = vi
      .fn()
      .mockResolvedValueOnce(reviewReport([proposal()]))
      .mockResolvedValueOnce(reviewReport([]));
    const store = new ReviewStore(memorySource({ promote, review }));
    await store.load("lv24");

    const action = store.promote("lv24", "prop-1", { as: "decision" });
    expect(store.proposals).toHaveLength(0);
    expect(store.pendingCount).toBe(0);
    expect(store.isBusy("prop-1")).toBe(true);

    resolvePromote(proposalOutcome());
    const outcome = await action;
    expect(outcome?.recordId).toBe("dec-9");
    expect(store.isBusy("prop-1")).toBe(false);
    await vi.waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  });

  it("restores the proposal and reports an action error", async () => {
    const store = new ReviewStore(
      memorySource({
        review: async () => reviewReport([proposal()]),
        promote: async () => Promise.reject(new Error("source changed")),
      }),
    );
    await store.load("lv24");
    const outcome = await store.promote("lv24", "prop-1");
    expect(outcome).toBeNull();
    expect(store.proposals).toHaveLength(1);
    expect(store.actionError).toBe("source changed");
    expect(store.isBusy("prop-1")).toBe(false);
  });

  it("dismisses an accepted proposal and keeps the list consistent", async () => {
    const dismiss = vi.fn(async () =>
      proposalOutcome({ proposalStatus: "dismissed", dismissed: true }),
    );
    const store = new ReviewStore(
      memorySource({
        dismiss,
        review: async () =>
          reviewReport([proposal({ status: "stale" })]),
      }),
    );
    await store.load("lv24");
    const outcome = await store.dismiss("lv24", "prop-1");
    expect(outcome?.dismissed).toBe(true);
    expect(dismiss).toHaveBeenCalledWith("lv24", "prop-1", {});
  });

  it("loads an all-projects report and refetches when the scope changes", async () => {
    const review = vi.fn(async (_project: string | null, options?: { allProjects?: boolean }) =>
      reviewReport([proposal({ projectId: "beta", id: "prop-b" })], {
        projectId: options?.allProjects ? "*" : "lv24",
        projectIds: options?.allProjects ? ["lv24", "beta"] : [],
        allProjects: options?.allProjects ?? false,
      }),
    );
    const store = new ReviewStore(memorySource({ review }));
    await store.load("lv24", { allProjects: true });
    expect(review).toHaveBeenCalledWith("lv24", { allProjects: true });
    expect(store.report?.projectId).toBe("*");
    expect(store.report?.projectIds).toEqual(["lv24", "beta"]);
    expect(store.isReadyFor("lv24")).toBe(true);

    store.setAllProjects(false);
    expect(store.report).toBeNull();
    expect(store.isReadyFor("lv24")).toBe(false);
  });

  it("loads queue bodies once with include_body and a token bound", async () => {
    const listProposals = vi.fn(async () =>
      proposalPage([
        proposal({
          body: "Use FTS5 because it ships with SQLite.",
          bodyTruncated: true,
          bodyTokens: 9,
          maxTokens: 600,
        }),
      ]),
    );
    const store = new ReviewStore(memorySource({ listProposals }));
    await store.loadProposalBodies("lv24", 600);
    expect(listProposals).toHaveBeenCalledWith("lv24", {
      statuses: ["pending", "stale"],
      includeBody: true,
      maxTokens: 600,
      limit: 200,
    });
    expect(store.bodies["prop-1"]?.body).toContain("FTS5");
    expect(store.bodies["prop-1"]?.bodyTruncated).toBe(true);
    await store.loadProposalBodies("lv24", 600);
    expect(listProposals).toHaveBeenCalledTimes(1);
  });

  it("loads a bounded proposal preview once per selection", async () => {
    const getProposal = vi.fn(async () => proposalDetail());
    const store = new ReviewStore(memorySource({ getProposal }));
    await store.loadPreview("lv24", "prop-1", 600);
    expect(getProposal).toHaveBeenCalledWith("lv24", "prop-1", 600);
    expect(store.preview?.body).toContain("FTS5");
    await store.loadPreview("lv24", "prop-1", 600);
    expect(getProposal).toHaveBeenCalledTimes(1);
    store.clearPreview();
    expect(store.preview).toBeNull();
  });

  it("previews safe fixes as a dry run and applies only after confirmation", async () => {
    const preview = reviewFixResult({
      dryRun: true,
      changes: [
        {
          kind: "stale-next",
          action: "set_next_action",
          field: "next_action",
          value: "Ship 1.2",
          evidence: "handoff-2",
        },
      ],
    });
    const applied = reviewFixResult({
      dryRun: false,
      changes: preview.changes,
    });
    const reviewFix = vi
      .fn()
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(applied);
    const review = vi
      .fn()
      .mockResolvedValueOnce(reviewReport([]))
      .mockResolvedValueOnce(reviewReport([]));
    const store = new ReviewStore(memorySource({ reviewFix, review }));
    await store.load("lv24");

    await store.previewFix("lv24");
    expect(reviewFix).toHaveBeenLastCalledWith("lv24", { kinds: undefined });
    expect(store.fixPreview?.dryRun).toBe(true);
    expect(store.fixPreview?.changes).toHaveLength(1);
    expect(store.fixApplied).toBeNull();

    const result = await store.applyFix("lv24");
    expect(reviewFix).toHaveBeenLastCalledWith("lv24", {
      apply: true,
      kinds: undefined,
    });
    expect(result?.dryRun).toBe(false);
    expect(store.fixApplied?.changes[0].value).toBe("Ship 1.2");
    expect(store.fixPreview).toBeNull();
    await vi.waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  });

  it("bulk promotion keeps failed items and reports the error", async () => {
    const promote = vi.fn(async (_project: string, id: string) => {
      if (id === "prop-2") {
        throw new Error("protected");
      }
      return proposalOutcome({ proposalId: id });
    });
    const review = vi.fn(async () =>
      reviewReport([proposal(), proposal({ id: "prop-2" })]),
    );
    const store = new ReviewStore(memorySource({ promote, review }));
    await store.load("lv24");
    const promoted = await store.promoteMany("lv24", ["prop-1", "prop-2"], {
      as: "decision",
    });
    expect(promoted).toBe(1);
    expect(store.actionError).toBe("protected");
    await vi.waitFor(() => expect(store.isBusy("prop-2")).toBe(false));
  });
});
