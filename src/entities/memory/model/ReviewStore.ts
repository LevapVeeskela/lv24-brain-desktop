import { makeAutoObservable, runInAction } from "mobx";
import { LocalApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import type {
  Finding,
  DueReview,
  Proposal,
  ProposalDecision,
  ProposalDetail,
  ProposalOutcome,
  ReviewFixResult,
  ReviewReport,
} from "./types";

export interface ReviewLoadOptions {
  force?: boolean;
  allProjects?: boolean;
}

function scopeKey(projectId: string | null, allProjects: boolean): string {
  return `${projectId ?? ""}|${allProjects ? "all" : "one"}`;
}

export class ReviewStore {
  projectId: string | null = null;
  /** Reads every project the agent allowlist serves instead of one project. */
  allProjects = false;
  report: ReviewReport | null = null;
  loading = false;
  loaded = false;
  error: string | null = null;
  errorCode: string | null = null;
  actionError: string | null = null;
  busyIds: string[] = [];

  preview: ProposalDetail | null = null;
  previewId: string | null = null;
  previewProjectId: string | null = null;
  previewLoading = false;
  previewError: string | null = null;

  /** Redacted bodies fetched for the whole queue with include_body=true. */
  bodies: Record<string, Proposal> = {};
  bodiesLoading = false;
  bodiesError: string | null = null;
  bodiesScope: string | null = null;

  fixPreview: ReviewFixResult | null = null;
  fixApplied: ReviewFixResult | null = null;
  fixPreviewLoading = false;
  fixApplyLoading = false;
  fixError: string | null = null;

  private readonly api: MemorySource;
  private token = 0;
  private inFlight: Promise<void> | null = null;
  private inFlightKey: string | null = null;
  private loadedScope: string | null = null;
  private previewToken = 0;
  private bodiesToken = 0;
  private fixToken = 0;
  private fixKinds: string[] | undefined;

  constructor(api: MemorySource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get proposals(): Proposal[] {
    return this.report?.proposals ?? [];
  }

  get findings(): Finding[] {
    return this.report?.findings ?? [];
  }

  get dueReviews(): DueReview[] {
    return this.report?.dueReviews ?? [];
  }

  get pendingCount(): number {
    return this.report?.pendingCount ?? 0;
  }

  get quarantinedCount(): number {
    return this.report?.quarantinedCount ?? 0;
  }

  /** True when the loaded report matches the store's current scope. */
  isReadyFor(projectId: string | null): boolean {
    if (!this.loaded) {
      return false;
    }
    if (this.loadedScope) {
      return this.loadedScope === scopeKey(projectId, this.allProjects);
    }
    return this.report?.projectId ===
      (this.allProjects ? "*" : (projectId ?? ""));
  }

  isBusy(proposalId: string): boolean {
    return this.busyIds.includes(proposalId);
  }

  /** Clears the report when the shell project changes. */
  setProject(projectId: string): void {
    if (this.projectId === projectId) {
      return;
    }
    this.resetScope();
    this.projectId = projectId;
  }

  setAllProjects(value: boolean): void {
    if (this.allProjects === value) {
      return;
    }
    this.allProjects = value;
    this.resetScope();
  }

  load(
    projectId: string | null,
    options: ReviewLoadOptions = {},
  ): Promise<void> {
    const allProjects = options.allProjects ?? this.allProjects;
    const key = scopeKey(projectId, allProjects);
    if (this.loadedScope === key && !options.force) {
      return Promise.resolve();
    }
    if (this.inFlightKey === key && this.inFlight && !options.force) {
      return this.inFlight;
    }
    this.projectId = projectId;
    this.allProjects = allProjects;
    const token = ++this.token;
    const task = this.performLoad(projectId, token, key, allProjects).finally(
      () => {
        if (this.inFlight === task) {
          this.inFlight = null;
          this.inFlightKey = null;
        }
      },
    );
    this.inFlight = task;
    this.inFlightKey = key;
    return task;
  }

  refresh(projectId = this.projectId): Promise<void> {
    return projectId
      ? this.load(projectId, { force: true })
      : Promise.resolve();
  }

  async loadPreview(
    projectId: string,
    proposalId: string,
    maxTokens = 600,
  ): Promise<void> {
    if (
      this.previewId === proposalId &&
      this.previewProjectId === projectId &&
      this.preview
    ) {
      return;
    }
    const token = ++this.previewToken;
    runInAction(() => {
      this.preview = null;
      this.previewId = proposalId;
      this.previewProjectId = projectId;
      this.previewLoading = true;
      this.previewError = null;
    });
    try {
      const preview = await this.api.getProposal(
        projectId,
        proposalId,
        maxTokens,
      );
      if (token !== this.previewToken) {
        return;
      }
      runInAction(() => {
        this.preview = preview;
      });
    } catch (cause) {
      if (token !== this.previewToken) {
        return;
      }
      runInAction(() => {
        this.previewError = errorMessage(cause);
      });
    } finally {
      if (token === this.previewToken) {
        runInAction(() => {
          this.previewLoading = false;
        });
      }
    }
  }

  clearPreview(): void {
    this.previewToken++;
    this.preview = null;
    this.previewId = null;
    this.previewProjectId = null;
    this.previewLoading = false;
    this.previewError = null;
  }

  /**
   * Fetches the queue's candidate bodies in one page with include_body. The
   * preview pane uses this data first and falls back to the detail route when
   * an item's body did not fit the page budget.
   */
  async loadProposalBodies(
    projectId: string,
    maxTokens = 600,
  ): Promise<void> {
    const key = `${projectId}|${maxTokens}`;
    if (this.bodiesScope === key) {
      return;
    }
    const token = ++this.bodiesToken;
    runInAction(() => {
      this.bodiesLoading = true;
      this.bodiesError = null;
    });
    try {
      const page = await this.api.listProposals(projectId, {
        statuses: ["pending", "stale"],
        includeBody: true,
        maxTokens,
        limit: 200,
      });
      if (token !== this.bodiesToken) {
        return;
      }
      const bodies: Record<string, Proposal> = {};
      for (const proposal of page.items) {
        bodies[proposal.id] = proposal;
      }
      runInAction(() => {
        this.bodies = bodies;
        this.bodiesScope = key;
      });
    } catch (cause) {
      if (token !== this.bodiesToken) {
        return;
      }
      runInAction(() => {
        this.bodiesError = errorMessage(cause);
      });
    } finally {
      if (token === this.bodiesToken) {
        runInAction(() => {
          this.bodiesLoading = false;
        });
      }
    }
  }

  clearBodies(): void {
    this.bodiesToken++;
    this.bodies = {};
    this.bodiesLoading = false;
    this.bodiesError = null;
    this.bodiesScope = null;
  }

  async previewFix(projectId: string, kinds?: string[]): Promise<void> {
    const token = ++this.fixToken;
    this.fixKinds = kinds;
    runInAction(() => {
      this.fixPreview = null;
      this.fixApplied = null;
      this.fixPreviewLoading = true;
      this.fixError = null;
    });
    try {
      const preview = await this.api.reviewFix(projectId, { kinds });
      if (token !== this.fixToken) {
        return;
      }
      runInAction(() => {
        this.fixPreview = preview;
      });
    } catch (cause) {
      if (token !== this.fixToken) {
        return;
      }
      runInAction(() => {
        this.fixError = errorMessage(cause);
      });
    } finally {
      if (token === this.fixToken) {
        runInAction(() => {
          this.fixPreviewLoading = false;
        });
      }
    }
  }

  /** Writes exactly the previewed safe fixes after an explicit confirmation. */
  async applyFix(projectId: string): Promise<ReviewFixResult | null> {
    if (!this.fixPreview || this.fixApplyLoading) {
      return null;
    }
    const token = ++this.fixToken;
    runInAction(() => {
      this.fixApplyLoading = true;
      this.fixError = null;
    });
    try {
      const applied = await this.api.reviewFix(projectId, {
        apply: true,
        kinds: this.fixKinds,
      });
      if (token !== this.fixToken) {
        return null;
      }
      runInAction(() => {
        this.fixPreview = null;
        this.fixApplied = applied;
      });
      void this.refresh();
      return applied;
    } catch (cause) {
      if (token === this.fixToken) {
        runInAction(() => {
          this.fixError = errorMessage(cause);
        });
      }
      return null;
    } finally {
      if (token === this.fixToken) {
        runInAction(() => {
          this.fixApplyLoading = false;
        });
      }
    }
  }

  clearFix(): void {
    this.fixToken++;
    this.fixPreview = null;
    this.fixApplied = null;
    this.fixPreviewLoading = false;
    this.fixApplyLoading = false;
    this.fixError = null;
    this.fixKinds = undefined;
  }

  async promote(
    projectId: string,
    proposalId: string,
    decision: ProposalDecision = {},
  ): Promise<ProposalOutcome | null> {
    return this.decide(projectId, proposalId, decision, "promote");
  }

  async dismiss(
    projectId: string,
    proposalId: string,
    decision: ProposalDecision = {},
  ): Promise<ProposalOutcome | null> {
    return this.decide(projectId, proposalId, decision, "dismiss");
  }

  /**
   * Promotes several proposals of the same kind. Each item is removed
   * optimistically; a rejected item is restored and the rest still run.
   */
  async promoteMany(
    projectId: string,
    proposalIds: string[],
    decision: ProposalDecision = {},
  ): Promise<number> {
    const before = this.report;
    if (!before || proposalIds.length === 0) {
      return 0;
    }
    runInAction(() => {
      this.actionError = null;
      this.report = removePending(before, proposalIds);
      this.busyIds = [...new Set([...this.busyIds, ...proposalIds])];
    });
    let promoted = 0;
    for (const proposalId of proposalIds) {
      try {
        await this.api.promote(projectId, proposalId, decision);
        promoted++;
      } catch (cause) {
        runInAction(() => {
          this.actionError = errorMessage(cause);
          const current = this.report;
          if (current && before) {
            const restored = before.proposals.find(
              (proposal) => proposal.id === proposalId,
            );
            if (
              restored &&
              !current.proposals.some((proposal) => proposal.id === proposalId)
            ) {
              this.report = {
                ...current,
                proposals: [restored, ...current.proposals],
                pendingCount: current.pendingCount + 1,
              };
            }
          }
        });
      } finally {
        runInAction(() => {
          this.busyIds = this.busyIds.filter((id) => id !== proposalId);
        });
      }
    }
    await this.refresh();
    return promoted;
  }

  clearActionError(): void {
    this.actionError = null;
  }

  dismissError(): void {
    this.error = null;
    this.errorCode = null;
    this.actionError = null;
    this.fixError = null;
    this.previewError = null;
  }

  /** Drops the loaded report and every scoped auxiliary view. */
  private resetScope(): void {
    this.token++;
    this.inFlight = null;
    this.inFlightKey = null;
    this.loadedScope = null;
    this.report = null;
    this.loading = false;
    this.loaded = false;
    this.error = null;
    this.errorCode = null;
    this.actionError = null;
    this.busyIds = [];
    this.clearPreview();
    this.clearBodies();
    this.clearFix();
  }

  private async decide(
    projectId: string,
    proposalId: string,
    decision: ProposalDecision,
    mode: "promote" | "dismiss",
  ): Promise<ProposalOutcome | null> {
    if (this.isBusy(proposalId)) {
      return null;
    }
    const before = this.report;
    runInAction(() => {
      this.actionError = null;
      this.busyIds = [...this.busyIds, proposalId];
      if (this.report) {
        this.report = removePending(this.report, [proposalId]);
      }
    });
    try {
      const outcome =
        mode === "promote"
          ? await this.api.promote(projectId, proposalId, decision)
          : await this.api.dismiss(projectId, proposalId, decision);
      // Refresh the loaded scope, not the promoted proposal's project: an
      // all-projects report must stay an aggregate.
      void this.refresh();
      return outcome;
    } catch (cause) {
      runInAction(() => {
        this.report = before;
        this.actionError = errorMessage(cause);
      });
      return null;
    } finally {
      runInAction(() => {
        this.busyIds = this.busyIds.filter((id) => id !== proposalId);
      });
    }
  }

  private async performLoad(
    projectId: string | null,
    token: number,
    key: string,
    allProjects: boolean,
  ): Promise<void> {
    runInAction(() => {
      if (this.loadedScope !== key) {
        this.report = null;
        this.loaded = false;
      }
      this.loading = true;
      this.error = null;
      this.errorCode = null;
    });
    try {
      const report = await this.api.review(projectId, { allProjects });
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.report = report;
        this.loaded = true;
        this.loadedScope = key;
      });
    } catch (cause) {
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.error = errorMessage(cause);
        this.errorCode = cause instanceof LocalApiError ? cause.code : null;
      });
    } finally {
      if (token === this.token) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }
}

function removePending(report: ReviewReport, ids: string[]): ReviewReport {
  const remaining = report.proposals.filter(
    (proposal) => !ids.includes(proposal.id),
  );
  return {
    ...report,
    proposals: remaining,
    pendingCount: Math.max(
      0,
      report.pendingCount - (report.proposals.length - remaining.length),
    ),
  };
}
