import { makeAutoObservable, runInAction } from "mobx";
import { LocalApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import type { Connection, Run } from "@/entities/connection/model/types";
import {
  runDisplayStatus,
  type RunDisplayStatus,
} from "@/entities/run/model/presentation";

/** GET /v1/runs shares the desktop's 100-run history window. */
const SYNC_RUN_LIST_LIMIT = 100;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_POLL_FAILURES = 3;
/**
 * Accepted jobs are bounded by the engine's 5-minute run timeout; this window
 * also covers a queue of two workers per engine. After it expires the panel
 * stays honest ("progress stopped") instead of polling forever.
 */
const MAX_SETTLE_MS = 10 * 60 * 1000;

export interface SyncFailure {
  connectionId: string;
  error: string;
}

export interface SyncSummary {
  total: number;
  attempted: number;
  queued: number;
  failures: SyncFailure[];
  remaining: number;
  canceled: boolean;
}

/** Counts queue requests, not completed ingestion jobs or provider items. */
export interface SyncProgress {
  total: number;
  attempted: number;
  queued: number;
  failed: number;
  currentConnectionId: string | null;
}

/**
 * A connection's batch state. "queued" means the request has not been accepted
 * yet or the engine has not reported the accepted job in GET /v1/runs yet.
 * Everything after that comes from the run's wire status (with the desktop's
 * presentation-only canceled mapping), never from guessed item counts.
 */
export type SyncConnectionState = "queued" | RunDisplayStatus;

export interface SyncConnectionProgress {
  connectionId: string;
  state: SyncConnectionState;
}

/** Tracks the engine's answer to a cancellation request per connection. */
export type SyncCancelState = "requested" | "accepted" | "failed";

export interface SyncRunApi {
  run(id: string): Promise<{ jobId: string }>;
  listRuns(limit?: number): Promise<Run[]>;
  cancelRun(id: string): Promise<void>;
}

export interface SyncEngine {
  readonly isRunning: boolean;
  readonly isUpdating: boolean;
  startEngine(): Promise<boolean>;
}

export interface SyncConnections {
  readonly items: Connection[];
  readonly error: string | null;
  load(force?: boolean): Promise<void>;
}

export interface SyncStoreOptions {
  /** Polling cadence for accepted jobs. Tests use a short interval. */
  pollIntervalMs?: number;
}

export class SyncStore {
  summary: SyncSummary | null = null;
  busy = false;
  error: string | null = null;
  progress: SyncProgress | null = null;
  progressError: string | null = null;
  progressStale = false;
  cancelRequested = false;

  /** Latest known state per connection; missing entries are queued. */
  states: Record<string, SyncConnectionState> = {};
  cancelStates: Record<string, SyncCancelState> = {};

  private readonly api: SyncRunApi;
  private readonly engine: SyncEngine;
  private readonly connections: SyncConnections;
  private readonly pollIntervalMs: number;

  private targets: string[] = [];
  /** Accepted job ID -> connection ID. Removed once the run is terminal. */
  private acceptedJobs: Record<string, string> = {};
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private pollGeneration = 0;
  private pollFailures = 0;
  private settleDeadline = 0;

  constructor(
    api: SyncRunApi,
    engine: SyncEngine,
    connections: SyncConnections,
    options: SyncStoreOptions = {},
  ) {
    this.api = api;
    this.engine = engine;
    this.connections = connections;
    this.pollIntervalMs = Math.max(50, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** True while queueing or while accepted jobs are still running. */
  get syncing(): boolean {
    return this.busy || this.hasActiveJobs;
  }

  get hasActiveJobs(): boolean {
    return Object.keys(this.acceptedJobs).length > 0;
  }

  get activeJobCount(): number {
    return Object.keys(this.acceptedJobs).length;
  }

  get canCancel(): boolean {
    return this.busy || this.hasActiveJobs;
  }

  /**
   * One row per connection in the batch. A connection that was never accepted
   * is shown as canceled after the user cancels the batch, because it will no
   * longer be queued.
   */
  get connectionProgress(): SyncConnectionProgress[] {
    return this.targets.map((connectionId) => ({
      connectionId,
      state:
        this.states[connectionId] ??
        (this.cancelRequested ? "canceled" : "queued"),
    }));
  }

  async runAll(): Promise<void> {
    if (this.busy || this.hasActiveJobs) {
      return;
    }
    if (this.engine.isUpdating) {
      // A bulk sync may need to start the agent. Doing that while the
      // installer replaces its files would race the update.
      this.error =
        "The brain agent is updating. Sync again after the update finishes.";
      return;
    }
    this.stopPolling();
    runInAction(() => {
      this.busy = true;
      this.error = null;
      this.progressError = null;
      this.progressStale = false;
      this.summary = null;
      this.progress = null;
      this.cancelRequested = false;
      this.states = {};
      this.cancelStates = {};
      this.targets = [];
      this.acceptedJobs = {};
      this.pollFailures = 0;
      this.settleDeadline = 0;
    });
    try {
      if (!this.engine.isRunning) {
        const started = await this.engine.startEngine();
        if (!started) {
          throw new Error("The brain agent did not start");
        }
      }
      await this.connections.load(true);
      if (this.connections.error) {
        throw new Error(this.connections.error);
      }
      // Keep this request set stable if polling replaces or mutates catalogue
      // entries while the queue is being submitted.
      const targets = this.connections.items.map((connection) => connection.id);
      let attempted = 0;
      let queued = 0;
      const failures: SyncFailure[] = [];
      const updateProgress = (currentConnectionId: string | null): void => {
        runInAction(() => {
          this.progress = {
            total: targets.length,
            attempted,
            queued,
            failed: failures.length,
            currentConnectionId,
          };
        });
      };
      runInAction(() => {
        this.targets = targets;
      });
      updateProgress(null);
      // Poll while the queue is being submitted so an accepted job that moves
      // from queued to running is visible before the last request returns.
      if (!this.cancelRequested) {
        this.startPolling();
      }
      for (const connectionId of targets) {
        if (this.cancelRequested) break;
        updateProgress(connectionId);
        try {
          // Do not abort this request: an accepted job outlives its request,
          // so its outcome must still be counted after Cancel sync.
          const accepted = await this.api.run(connectionId);
          runInAction(() => {
            queued += 1;
            this.acceptedJobs[accepted.jobId] = connectionId;
            if (!this.states[connectionId]) {
              this.states[connectionId] = "queued";
            }
          });
          if (this.cancelRequested) {
            // The request was in flight when the user canceled. Cancel the
            // job that was accepted after that decision as well.
            void this.cancelJob(accepted.jobId);
          }
        } catch (cause) {
          runInAction(() => {
            this.states[connectionId] = "failed";
            failures.push({
              connectionId,
              error: errorMessage(cause),
            });
          });
        }
        attempted += 1;
        updateProgress(null);
      }
      runInAction(() => {
        const remaining = targets.length - attempted;
        this.summary = {
          total: targets.length,
          attempted,
          queued,
          failures,
          remaining,
          canceled: this.cancelRequested,
        };
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.busy = false;
        if (this.progress) {
          this.progress = { ...this.progress, currentConnectionId: null };
        }
        // Accepted jobs now own the wait; give their polling a bounded window
        // that starts after queueing instead of while the requests are still
        // being submitted.
        if (this.settleDeadline === 0) {
          this.settleDeadline = Date.now() + MAX_SETTLE_MS;
        }
      });
      this.syncPollingWithWork();
    }
  }

  /**
   * Stops enqueueing new connections and asks the engine to cancel every
   * accepted queued/running job. A job that already finished is not an error.
   */
  async cancelAll(): Promise<boolean> {
    if (!this.canCancel || this.cancelRequested) {
      return false;
    }
    this.cancelRequested = true;
    // A cancel is also a deliberate progress refresh: extend the bounded
    // window so a previously stale poll does not keep the cancel invisible.
    this.progressStale = false;
    this.settleDeadline = Date.now() + MAX_SETTLE_MS;
    const jobIds = Object.keys(this.acceptedJobs);
    if (jobIds.length === 0) {
      return true;
    }
    await Promise.all(jobIds.map((jobId) => this.cancelJob(jobId)));
    if (!this.polling) {
      this.startPolling();
    }
    return true;
  }

  dismissError(): void {
    this.error = null;
    this.progressError = null;
  }

  /**
   * Restarts progress polling after the bounded settle window stopped it.
   * Never invents terminal states; rows keep their last observed status.
   */
  refreshProgress(): void {
    if (!this.syncing) {
      return;
    }
    this.progressStale = false;
    this.settleDeadline = Date.now() + MAX_SETTLE_MS;
    this.stopPolling();
    this.startPolling();
  }

  /** Stops timers; the store can still be inspected. */
  dispose(): void {
    this.stopPolling();
  }

  private async cancelJob(jobId: string): Promise<void> {
    const connectionId = this.acceptedJobs[jobId];
    if (!connectionId) {
      return;
    }
    this.cancelStates[connectionId] = "requested";
    try {
      await this.api.cancelRun(jobId);
      if (this.acceptedJobs[jobId] === connectionId) {
        this.cancelStates[connectionId] = "accepted";
      }
    } catch (cause) {
      if (
        cause instanceof LocalApiError &&
        (cause.status === 404 || cause.status === 409)
      ) {
        // Unknown/expired or already finished: the next poll reports the
        // real terminal run state, so this is not a cancellation failure.
        if (this.cancelStates[connectionId] === "requested") {
          delete this.cancelStates[connectionId];
        }
        this.requestPollNow();
        return;
      }
      this.cancelStates[connectionId] = "failed";
      this.progressError = errorMessage(cause);
    }
  }

  private startPolling(): void {
    if (this.polling) {
      return;
    }
    this.polling = true;
    this.pollFailures = 0;
    const generation = ++this.pollGeneration;
    void this.poll(generation);
  }

  private stopPolling(): void {
    this.polling = false;
    this.pollGeneration += 1;
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private syncPollingWithWork(): void {
    if (this.busy || this.hasActiveJobs) {
      this.startPolling();
      return;
    }
    this.stopPolling();
  }

  private requestPollNow(): void {
    if (!this.polling) {
      this.progressStale = false;
      this.settleDeadline = Date.now() + MAX_SETTLE_MS;
      this.startPolling();
    }
  }

  private async poll(generation: number): Promise<void> {
    if (!this.polling || generation !== this.pollGeneration) {
      return;
    }
    if (this.settleDeadline !== 0 && Date.now() >= this.settleDeadline) {
      runInAction(() => {
        this.progressStale = true;
      });
      this.stopPolling();
      return;
    }
    let runs: Run[];
    try {
      runs = await this.api.listRuns(SYNC_RUN_LIST_LIMIT);
    } catch (cause) {
      // A response for a stopped or restarted batch must not resurrect old
      // progress after a cancel/finish.
      if (!this.polling || generation !== this.pollGeneration) {
        return;
      }
      runInAction(() => {
        this.pollFailures += 1;
        this.progressError = errorMessage(cause);
      });
      if (this.pollFailures >= MAX_POLL_FAILURES || !this.syncing) {
        this.stopPolling();
        return;
      }
      this.schedulePoll(generation);
      return;
    }
    if (!this.polling || generation !== this.pollGeneration) {
      return;
    }
    runInAction(() => {
      this.pollFailures = 0;
      this.progressError = null;
      this.applyRuns(runs);
    });
    if (!this.syncing) {
      this.stopPolling();
      return;
    }
    this.schedulePoll(generation);
  }

  private schedulePoll(generation: number): void {
    if (!this.polling || generation !== this.pollGeneration) {
      return;
    }
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.poll(generation);
    }, this.pollIntervalMs);
  }

  private applyRuns(runs: Run[]): void {
    const byId = new Map(runs.map((run) => [run.id, run] as const));
    for (const [jobId, connectionId] of Object.entries(this.acceptedJobs)) {
      const run = byId.get(jobId);
      if (!run) {
        continue;
      }
      const state = runDisplayStatus(run);
      this.states[connectionId] = state;
      if (state !== "running") {
        delete this.acceptedJobs[jobId];
        delete this.cancelStates[connectionId];
      }
    }
  }
}
