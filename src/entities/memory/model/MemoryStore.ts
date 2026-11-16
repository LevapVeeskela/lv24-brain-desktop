import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import {
  emptyRecordFilters,
  type CatchupReport,
  type MemoryRecord,
  type RecordDetail,
  type RecordFilters,
  type RecordListQuery,
  type RecordPage,
} from "./types";

export const RECORD_PAGE_SIZE = 25;

function queryFromFilters(filters: RecordFilters, limit: number): RecordListQuery {
  return {
    kinds: filters.kinds.length ? [...filters.kinds] : undefined,
    status: filters.status || undefined,
    scope: filters.scope || undefined,
    subtype: filters.subtype.trim() || undefined,
    topic: filters.topic.trim() || undefined,
    dueReview: filters.dueReview,
    limit,
  };
}

export class MemoryStore {
  projectId: string | null = null;
  filters: RecordFilters = emptyRecordFilters();
  items: MemoryRecord[] = [];
  page = 0;
  hasMore = false;
  loading = false;
  loadingMore = false;
  loaded = false;
  error: string | null = null;

  detail: RecordDetail | null = null;
  detailId: string | null = null;
  detailProjectId: string | null = null;
  detailLoading = false;
  detailError: string | null = null;

  recentItems: MemoryRecord[] = [];
  latestHandoff: MemoryRecord | null = null;
  recentProjectId: string | null = null;
  recentLoading = false;
  recentError: string | null = null;

  catchup: CatchupReport | null = null;
  catchupProjectId: string | null = null;
  catchupLoading = false;
  catchupError: string | null = null;

  private readonly api: MemorySource;
  private cursor: string | null = null;
  private listToken = 0;
  private detailToken = 0;
  private recentToken = 0;
  private catchupToken = 0;
  private listInFlight: Promise<void> | null = null;

  constructor(api: MemorySource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get count(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.loaded && this.items.length === 0;
  }

  /** Clears project-scoped data when the shell selection changes. */
  setProject(projectId: string): void {
    if (this.projectId === projectId) {
      return;
    }
    this.projectId = projectId;
    this.invalidateList();
    this.clearDetail();
    this.recentToken++;
    this.recentItems = [];
    this.latestHandoff = null;
    this.recentProjectId = null;
    this.recentLoading = false;
    this.recentError = null;
    this.catchupToken++;
    this.catchup = null;
    this.catchupProjectId = null;
    this.catchupLoading = false;
    this.catchupError = null;
  }

  applyFilters(patch: Partial<RecordFilters>): void {
    this.filters = {
      ...this.filters,
      ...patch,
      kinds: patch.kinds ? [...patch.kinds] : this.filters.kinds,
    };
    this.invalidateList();
  }

  clearFilters(): void {
    this.filters = emptyRecordFilters();
    this.invalidateList();
  }

  load(projectId: string, options: { force?: boolean } = {}): Promise<void> {
    const sameProject = this.projectId === projectId;
    if (sameProject && this.loadListInFlight()) {
      return this.listInFlight as Promise<void>;
    }
    if (sameProject && this.loaded && !options.force) {
      return Promise.resolve();
    }
    const token = ++this.listToken;
    const task = this.performLoad(projectId, token).finally(() => {
      if (this.listInFlight === task) {
        this.listInFlight = null;
      }
    });
    this.listInFlight = task;
    return task;
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
    const token = this.listToken;
    const projectId = this.projectId;
    const cursor = this.cursor;
    this.loadingMore = true;
    return this.api
      .listRecords(projectId, {
        ...queryFromFilters(this.filters, RECORD_PAGE_SIZE),
        cursor,
      })
      .then(
        (page) => {
          if (token !== this.listToken || projectId !== this.projectId) {
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
          if (token === this.listToken && projectId === this.projectId) {
            runInAction(() => {
              this.error = errorMessage(cause);
              this.loadingMore = false;
            });
          }
        },
      );
  }

  async loadDetail(
    projectId: string,
    recordId: string,
    options: { history?: boolean; force?: boolean } = {},
  ): Promise<void> {
    if (
      !options.force &&
      this.detail &&
      this.detailId === recordId &&
      this.detailProjectId === projectId
    ) {
      return;
    }
    const token = ++this.detailToken;
    runInAction(() => {
      this.detail = null;
      this.detailId = recordId;
      this.detailProjectId = projectId;
      this.detailLoading = true;
      this.detailError = null;
    });
    try {
      const detail = await this.api.getRecord(projectId, recordId, {
        history: options.history ?? true,
      });
      if (token !== this.detailToken) {
        return;
      }
      runInAction(() => {
        this.detail = detail;
      });
    } catch (cause) {
      if (token !== this.detailToken) {
        return;
      }
      runInAction(() => {
        this.detailError = errorMessage(cause);
      });
    } finally {
      if (token === this.detailToken) {
        runInAction(() => {
          this.detailLoading = false;
        });
      }
    }
  }

  clearDetail(): void {
    this.detailToken++;
    this.detail = null;
    this.detailId = null;
    this.detailProjectId = null;
    this.detailLoading = false;
    this.detailError = null;
  }

  async loadProjectSummary(projectId: string, limit = 8): Promise<void> {
    const token = ++this.recentToken;
    runInAction(() => {
      this.recentProjectId = projectId;
      this.recentLoading = true;
      this.recentError = null;
    });
    try {
      const [recent, handoffs] = await Promise.all([
        this.api.listRecords(projectId, { limit }),
        this.api.listRecords(projectId, { kinds: ["handoff"], limit: 1 }),
      ]);
      if (token !== this.recentToken) {
        return;
      }
      runInAction(() => {
        this.recentItems = recent.items;
        this.latestHandoff = handoffs.items[0] ?? null;
      });
    } catch (cause) {
      if (token !== this.recentToken) {
        return;
      }
      runInAction(() => {
        this.recentError = errorMessage(cause);
      });
    } finally {
      if (token === this.recentToken) {
        runInAction(() => {
          this.recentLoading = false;
        });
      }
    }
  }

  async loadCatchup(
    projectId: string,
    options: { force?: boolean; limit?: number } = {},
  ): Promise<void> {
    if (
      !options.force &&
      this.catchup &&
      this.catchupProjectId === projectId
    ) {
      return;
    }
    const token = ++this.catchupToken;
    runInAction(() => {
      if (this.catchupProjectId !== projectId) {
        this.catchup = null;
      }
      this.catchupProjectId = projectId;
      this.catchupLoading = true;
      this.catchupError = null;
    });
    try {
      const catchup = await this.api.catchup(projectId, {
        limit: options.limit ?? 50,
      });
      if (token !== this.catchupToken) {
        return;
      }
      runInAction(() => {
        this.catchup = catchup;
      });
    } catch (cause) {
      if (token !== this.catchupToken) {
        return;
      }
      runInAction(() => {
        this.catchupError = errorMessage(cause);
      });
    } finally {
      if (token === this.catchupToken) {
        runInAction(() => {
          this.catchupLoading = false;
        });
      }
    }
  }

  dismissError(): void {
    this.error = null;
    this.detailError = null;
    this.recentError = null;
    this.catchupError = null;
  }

  private loadListInFlight(): boolean {
    return this.listInFlight !== null;
  }

  private invalidateList(): void {
    this.items = [];
    this.page = 0;
    this.hasMore = false;
    this.cursor = null;
    this.loaded = false;
    this.error = null;
    this.loading = false;
    this.loadingMore = false;
    this.listToken++;
    this.listInFlight = null;
  }

  private async performLoad(projectId: string, token: number): Promise<void> {
    runInAction(() => {
      this.projectId = projectId;
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
      const page: RecordPage = await this.api.listRecords(
        projectId,
        queryFromFilters(this.filters, RECORD_PAGE_SIZE),
      );
      if (token !== this.listToken) {
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
      if (token !== this.listToken) {
        return;
      }
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      if (token === this.listToken) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }
}
