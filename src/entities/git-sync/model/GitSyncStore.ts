import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import { gitSyncApi, type GitSyncSource } from "../api/gitSyncApi";
import type { GitSyncStatus } from "./types";

export class GitSyncStore {
  status: GitSyncStatus | null = null;
  loading = false;
  syncing = false;
  loaded = false;
  error: string | null = null;

  private readonly api: GitSyncSource;
  private inFlight: Promise<void> | null = null;

  constructor(api: GitSyncSource = gitSyncApi) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get conflicts(): string[] {
    return this.status?.conflicts ?? [];
  }

  get hasConflicts(): boolean {
    return this.conflicts.length > 0 || (this.status?.unmerged ?? false);
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

  async sync(push = true): Promise<boolean> {
    if (this.syncing) {
      return false;
    }
    runInAction(() => {
      this.syncing = true;
      this.error = null;
    });
    try {
      const next = await this.api.sync(push);
      runInAction(() => {
        this.status = next;
        this.loaded = true;
      });
      return true;
    } catch (cause) {
      const message = errorMessage(cause);
      runInAction(() => {
        this.error = message;
      });
      // A conflict returns 409 and the latest status carries the paths. Keep
      // the sync error visible: the follow-up read clears it on success.
      await this.load(true);
      runInAction(() => {
        this.error = message;
      });
      return false;
    } finally {
      runInAction(() => {
        this.syncing = false;
      });
    }
  }

  private async performLoad(): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const next = await this.api.status();
      runInAction(() => {
        this.status = next;
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
}
