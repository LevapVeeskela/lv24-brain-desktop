import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { Run } from "@/entities/connection/model/types";
import { runApi, type RunLogEnd, type RunLogEvent } from "../api/runApi";

const MAX_LOG_LINES = 1000;
export const RUN_LIST_LIMIT = 100;

export interface RunsSource {
  listRuns(limit?: number): Promise<Run[]>;
}

export interface RunLogApi {
  openLog(runId: string): Promise<string>;
  closeLog(streamId: string): Promise<void>;
  onLog(listener: (event: RunLogEvent) => void): Promise<() => void>;
  onEnd(listener: (event: RunLogEnd) => void): Promise<() => void>;
}

export interface LogLine {
  /** Stable monotonic id used as the React key for this line. */
  id: number;
  event: string;
  data: string;
}

export class RunsStore {
  items: Run[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;

  selectedRunId: string | null = null;
  logs: LogLine[] = [];
  logError: string | null = null;
  streaming = false;

  private readonly api: RunsSource;
  private readonly logApi: RunLogApi;
  private started = false;
  private streamId: string | null = null;
  private opening = false;
  private unsubscribers: Array<() => void> = [];
  private earlyLogs = new Map<string, LogLine[]>();
  private earlyEnd = new Map<string, string | undefined>();
  private inFlight: Promise<void> | null = null;
  private nextLogId = 0;

  constructor(api: RunsSource, logApi: RunLogApi = runApi) {
    this.api = api;
    this.logApi = logApi;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    void this.bindEvents();
  }

  dispose(): void {
    this.started = false;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // Listener cleanup is best effort.
      }
    }
    void this.closeLog();
  }

  load(force = false): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.loaded && !force) {
      return Promise.resolve();
    }
    const task = this.performLoad().finally(() => {
      if (this.inFlight === task) {
        this.inFlight = null;
      }
    });
    this.inFlight = task;
    return task;
  }

  forConnection(connectionId: string): Run[] {
    return this.items.filter(
      (run) =>
        run.connectionId === connectionId ||
        run.id.startsWith(`${connectionId}-`),
    );
  }

  async openLog(runId: string): Promise<void> {
    await this.closeLog();
    this.selectedRunId = runId;
    this.logs = [];
    this.logError = null;
    this.streaming = true;
    this.opening = true;
    try {
      const streamId = await this.logApi.openLog(runId);
      runInAction(() => {
        this.streamId = streamId;
        this.opening = false;
        const early = this.earlyLogs.get(streamId);
        if (early) {
          this.logs = early.slice(-MAX_LOG_LINES);
          this.earlyLogs.delete(streamId);
        }
        if (this.earlyEnd.has(streamId)) {
          this.logError = this.earlyEnd.get(streamId) ?? null;
          this.streaming = false;
          this.earlyEnd.delete(streamId);
        }
      });
    } catch (cause) {
      runInAction(() => {
        this.opening = false;
        this.streaming = false;
        this.logError = errorMessage(cause);
      });
    }
  }

  async closeLog(): Promise<void> {
    const streamId = this.streamId;
    this.streamId = null;
    this.opening = false;
    this.streaming = false;
    this.earlyLogs.clear();
    this.earlyEnd.clear();
    if (streamId) {
      try {
        await this.logApi.closeLog(streamId);
      } catch {
        // The stream may already be finished.
      }
    }
  }

  async resetLog(): Promise<void> {
    await this.closeLog();
    this.selectedRunId = null;
    this.logs = [];
    this.logError = null;
  }

  dismissError(): void {
    this.error = null;
    this.logError = null;
  }

  private async performLoad(): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const items = await this.api.listRuns(RUN_LIST_LIMIT);
      runInAction(() => {
        this.items = items;
        this.loaded = true;
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  private async bindEvents(): Promise<void> {
    try {
      const unsubscribers = await Promise.all([
        this.logApi.onLog((event) => this.handleLog(event)),
        this.logApi.onEnd((event) => this.handleEnd(event)),
      ]);
      if (!this.started) {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
        return;
      }
      this.unsubscribers.push(...unsubscribers);
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    }
  }

  private handleLog(event: RunLogEvent): void {
    const line = {
      id: this.nextLogId++,
      event: event.event,
      data: event.data,
    };
    if (this.streamId === event.streamId) {
      runInAction(() => {
        this.logs.push(line);
        if (this.logs.length > MAX_LOG_LINES) {
          this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
        }
      });
      return;
    }
    if (this.opening) {
      const existing = this.earlyLogs.get(event.streamId) ?? [];
      existing.push(line);
      this.earlyLogs.set(event.streamId, existing.slice(-MAX_LOG_LINES));
    }
  }

  private handleEnd(event: RunLogEnd): void {
    if (this.streamId === event.streamId) {
      runInAction(() => {
        this.streaming = false;
        this.logError = event.error ?? null;
      });
      void this.load(true);
      return;
    }
    if (this.opening) {
      this.earlyEnd.set(event.streamId, event.error);
    }
  }
}
