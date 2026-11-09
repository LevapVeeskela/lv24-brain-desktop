import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { Connection } from "@/entities/connection/model/types";

export interface SyncFailure {
  connectionId: string;
  error: string;
}

export interface SyncSummary {
  total: number;
  queued: number;
  failures: SyncFailure[];
}

export interface SyncRunApi {
  run(id: string): Promise<{ jobId: string }>;
}

export interface SyncEngine {
  readonly isRunning: boolean;
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
    this.busy = true;
    this.error = null;
    this.summary = null;
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
      const targets = this.connections.items;
      let queued = 0;
      const failures: SyncFailure[] = [];
      for (const connection of targets) {
        try {
          await this.api.run(connection.id);
          queued += 1;
        } catch (cause) {
          failures.push({
            connectionId: connection.id,
            error: errorMessage(cause),
          });
        }
      }
      runInAction(() => {
        this.summary = { total: targets.length, queued, failures };
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

  dismissError(): void {
    this.error = null;
  }
}
