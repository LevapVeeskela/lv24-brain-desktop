import { makeAutoObservable, reaction, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { Connection, RunAccepted } from "./types";

export interface ConnectionsApi {
  list(): Promise<Connection[]>;
  run(id: string): Promise<RunAccepted>;
}

export interface EngineRunningSource {
  readonly isRunning: boolean;
}

export class ConnectionsStore {
  items: Connection[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;

  private readonly api: ConnectionsApi;
  private readonly engine: EngineRunningSource;
  private stopReaction: (() => void) | null = null;
  private inFlight: Promise<void> | null = null;
  private loadToken = 0;

  constructor(api: ConnectionsApi, engine: EngineRunningSource) {
    this.api = api;
    this.engine = engine;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  start(): void {
    if (this.stopReaction) {
      return;
    }
    this.stopReaction = reaction(
      () => this.engine.isRunning,
      (running) => {
        if (running) {
          void this.load();
        } else {
          this.reset();
        }
      },
      { fireImmediately: true },
    );
  }

  get count(): number {
    return this.items.length;
  }

  load(force = false): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.loaded && !force) {
      return Promise.resolve();
    }
    const token = ++this.loadToken;
    const task = this.performLoad(token).finally(() => {
      if (this.inFlight === task) {
        this.inFlight = null;
      }
    });
    this.inFlight = task;
    return task;
  }

  private async performLoad(token: number): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const items = await this.api.list();
      if (token === this.loadToken) {
        runInAction(() => {
          this.items = items;
          this.loaded = true;
        });
      }
    } catch (cause) {
      if (token === this.loadToken) {
        runInAction(() => {
          this.error = errorMessage(cause);
        });
      }
    } finally {
      if (token === this.loadToken) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  async run(id: string): Promise<RunAccepted> {
    return this.api.run(id);
  }

  reset(): void {
    this.loadToken += 1;
    this.inFlight = null;
    this.items = [];
    this.loaded = false;
    this.loading = false;
    this.error = null;
  }

  dismissError(): void {
    this.error = null;
  }

  dispose(): void {
    this.stopReaction?.();
    this.stopReaction = null;
    this.reset();
  }
}
