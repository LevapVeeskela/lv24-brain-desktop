import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import type {
  Finding,
  DueReview,
  Proposal,
  ProposalDecision,
  ProposalOutcome,
  ReviewReport,
} from "./types";

export class ReviewStore {
  projectId: string | null = null;
  report: ReviewReport | null = null;
  loading = false;
  loaded = false;
  error: string | null = null;
  actionError: string | null = null;
  busyIds: string[] = [];

  private readonly api: MemorySource;
  private token = 0;
  private inFlight: Promise<void> | null = null;

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

  isBusy(proposalId: string): boolean {
    return this.busyIds.includes(proposalId);
  }

  /** Clears the report when the shell project changes. */
  setProject(projectId: string): void {
    if (this.projectId === projectId) {
      return;
    }
    this.token++;
    this.inFlight = null;
    this.projectId = projectId;
    this.report = null;
    this.loading = false;
    this.loaded = false;
    this.error = null;
    this.actionError = null;
    this.busyIds = [];
  }

  load(projectId: string, options: { force?: boolean } = {}): Promise<void> {
    if (
      this.projectId === projectId &&
      this.loaded &&
      !options.force
    ) {
      return Promise.resolve();
    }
    if (this.projectId === projectId && this.inFlight && !options.force) {
      return this.inFlight;
    }
    this.projectId = projectId;
    const token = ++this.token;
    const task = this.performLoad(projectId, token).finally(() => {
      if (this.inFlight === task) {
        this.inFlight = null;
      }
    });
    this.inFlight = task;
    return task;
  }

  refresh(projectId = this.projectId): Promise<void> {
    return projectId ? this.load(projectId, { force: true }) : Promise.resolve();
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
    await this.refresh(projectId);
    return promoted;
  }

  clearActionError(): void {
    this.actionError = null;
  }

  dismissError(): void {
    this.error = null;
    this.actionError = null;
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
      void this.refresh(projectId);
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

  private async performLoad(projectId: string, token: number): Promise<void> {
    runInAction(() => {
      if (this.report && this.report.projectId !== projectId) {
        this.report = null;
        this.loaded = false;
      }
      this.loading = true;
      this.error = null;
    });
    try {
      const report = await this.api.review(projectId);
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.report = report;
        this.loaded = true;
      });
    } catch (cause) {
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.error = errorMessage(cause);
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
    pendingCount: Math.max(0, report.pendingCount - (report.proposals.length - remaining.length)),
  };
}
