import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { Connection } from "@/entities/connection/model/types";

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

export interface SyncRunApi {
  run(id: string): Promise<{ jobId: string }>;
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

export class SyncStore {
  summary: SyncSummary | null = null;
  busy = false;
  error: string | null = null;
  progress: SyncProgress | null = null;
  cancelRequested = false;

  private readonly api: SyncRunApi;
  private readonly engine: SyncEngine;
  private readonly connections: SyncConnections;

  constructor(
    api: SyncRunApi,
    engine: SyncEngine,
    connections: SyncConnections,
  ) {
    this.api = api;
    this.engine = engine;
    this.connections = connections;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  async runAll(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (this.engine.isUpdating) {
      // A bulk sync may need to start the agent. Doing that while the
      // installer replaces its files would race the update.
      this.error =
        "The brain agent is updating. Sync again after the update finishes.";
      return;
    }
    this.busy = true;
    this.error = null;
    this.summary = null;
    this.progress = null;
    this.cancelRequested = false;
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
      updateProgress(null);
      for (const connectionId of targets) {
        if (this.cancelRequested) break;
        updateProgress(connectionId);
        try {
          // Do not abort this request: an accepted job outlives its request,
          // so its outcome must still be counted after Cancel remaining queue.
          await this.api.run(connectionId);
          queued += 1;
        } catch (cause) {
          failures.push({
            connectionId,
            error: errorMessage(cause),
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
          canceled: this.cancelRequested && remaining > 0,
        };
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.busy = false;
      });
    }
  }

  get canCancelRemaining(): boolean {
    if (!this.busy || this.cancelRequested) return false;
    if (!this.progress) return true;
    const inFlight = this.progress.currentConnectionId === null ? 0 : 1;
    return this.progress.total > this.progress.attempted + inFlight;
  }

  /** Only prevents future enqueue requests. Accepted jobs continue running. */
  cancelRemaining(): boolean {
    if (!this.canCancelRemaining) return false;
    this.cancelRequested = true;
    return true;
  }

  dismissError(): void {
    this.error = null;
  }
}
