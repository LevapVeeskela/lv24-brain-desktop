import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import type {
  QuarantineItem,
  QuarantinePage,
  TrustLevel,
} from "./types";

export const QUARANTINE_PAGE_SIZE = 25;

/**
 * The review inbox for unreviewed external writes and unknown origins.
 * Bodies are never returned by the quarantine route; the detail lives in the
 * record browser.
 */
export class QuarantineStore {
  projectId: string | null = null;
  items: QuarantineItem[] = [];
  page = 0;
  hasMore = false;
  loading = false;
  loadingMore = false;
  loaded = false;
  error: string | null = null;

  reviewingId: string | null = null;
  actionError: string | null = null;
  lastReviewed: QuarantineItem | null = null;

  private readonly api: MemorySource;
  private cursor: string | null = null;
  private token = 0;
  private inFlight: Promise<void> | null = null;

  constructor(api: MemorySource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isEmpty(): boolean {
    return this.loaded && this.items.length === 0;
  }

  setProject(projectId: string): void {
    if (this.projectId === projectId) {
      return;
    }
    this.projectId = projectId;
    this.invalidate();
  }

  load(projectId: string, options: { force?: boolean } = {}): Promise<void> {
    const sameProject = this.projectId === projectId;
    if (sameProject && this.loaded && !options.force) {
      return Promise.resolve();
    }
    if (sameProject && this.inFlight) {
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
    return projectId
      ? this.load(projectId, { force: true })
      : Promise.resolve();
  }

  loadMore(): Promise<void> {
    if (
      !this.projectId ||
      !this.hasMore ||
      !this.cursor ||
      this.loading ||
      this.loadingMore
    ) {
      return Promise.resolve();
    }
    const projectId = this.projectId;
    const token = this.token;
    const cursor = this.cursor;
    this.loadingMore = true;
    return this.api.listQuarantine(projectId, {
      limit: QUARANTINE_PAGE_SIZE,
      cursor,
    }).then(
      (page) => {
        if (token !== this.token || projectId !== this.projectId) {
          return;
        }
        runInAction(() => {
          this.items = [...this.items, ...page.items];
          this.page = page.page;
          this.hasMore = page.hasMore;
          this.cursor = page.nextCursor ?? null;
          this.loadingMore = false;
        });
      },
      (cause: unknown) => {
        if (token === this.token && projectId === this.projectId) {
          runInAction(() => {
            this.error = errorMessage(cause);
            this.loadingMore = false;
          });
        }
      },
    );
  }

  /**
   * Marks one record reviewed with an optional trust override. A reviewed row
   * leaves the inbox; an unknown origin can stay quarantined, so the list is
   * refreshed after the call instead of being trusted blindly.
   */
  async review(
    projectId: string,
    recordId: string,
    trust?: TrustLevel,
  ): Promise<boolean> {
    if (this.reviewingId) {
      return false;
    }
    const before = this.items;
    const target = before.find((item) => item.id === recordId) ?? null;
    runInAction(() => {
      this.reviewingId = recordId;
      this.actionError = null;
      this.items = this.items.filter((item) => item.id !== recordId);
    });
    try {
      await this.api.reviewQuarantine(projectId, recordId, trust);
      runInAction(() => {
        this.lastReviewed = target;
      });
      void this.refresh(projectId);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.items = before;
        this.actionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.reviewingId = null;
      });
    }
  }

  dismissError(): void {
    this.error = null;
    this.actionError = null;
  }

  private invalidate(): void {
    this.token++;
    this.inFlight = null;
    this.items = [];
    this.page = 0;
    this.hasMore = false;
    this.cursor = null;
    this.loading = false;
    this.loadingMore = false;
    this.loaded = false;
    this.error = null;
    this.actionError = null;
    this.reviewingId = null;
  }

  private async performLoad(projectId: string, token: number): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.loadingMore = false;
      this.error = null;
      this.items = [];
      this.page = 0;
      this.hasMore = false;
      this.cursor = null;
      this.loaded = false;
    });
    try {
      const page: QuarantinePage = await this.api.listQuarantine(projectId, {
        limit: QUARANTINE_PAGE_SIZE,
      });
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.items = page.items;
        this.page = page.page;
        this.hasMore = page.hasMore;
        this.cursor = page.nextCursor ?? null;
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
