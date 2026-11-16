import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import {
  emptySearchFilters,
  SEARCH_MIN_LENGTH,
  type SearchFilters,
  type SearchHit,
  type SearchPage,
} from "./types";

export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 220;

export interface SearchScheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

const defaultScheduler: SearchScheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface SearchStoreOptions {
  debounceMs?: number;
  scheduler?: SearchScheduler;
}

export class SearchStore {
  projectId: string | null = null;
  query = "";
  appliedQuery = "";
  filters: SearchFilters = emptySearchFilters();
  hits: SearchHit[] = [];
  page = 0;
  hasMore = false;
  loading = false;
  loadingMore = false;
  searched = false;
  error: string | null = null;
  notice: string | null = null;
  relaxed = false;

  private readonly api: MemorySource;
  private readonly debounceMs: number;
  private readonly scheduler: SearchScheduler;
  private timer: unknown = null;
  private cursor: string | null = null;
  private token = 0;

  constructor(api: MemorySource, options: SearchStoreOptions = {}) {
    this.api = api;
    this.debounceMs = options.debounceMs ?? SEARCH_DEBOUNCE_MS;
    this.scheduler = options.scheduler ?? defaultScheduler;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get tooShort(): boolean {
    return this.query.trim().length < SEARCH_MIN_LENGTH;
  }

  get isEmpty(): boolean {
    return this.searched && !this.loading && this.hits.length === 0;
  }

  setProject(projectId: string, options: { search?: boolean } = {}): void {
    if (this.projectId === projectId) {
      return;
    }
    const previousQuery = this.query;
    this.projectId = projectId;
    this.cancelTimer();
    this.resetResults();
    if (
      options.search !== false &&
      previousQuery.trim().length >= SEARCH_MIN_LENGTH
    ) {
      this.setQuery(previousQuery);
    }
  }

  setQuery(value: string): void {
    this.query = value;
    this.cancelTimer();
    const trimmed = value.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      this.resetResults();
      return;
    }
    this.timer = this.scheduler.set(() => {
      this.timer = null;
      void this.run(trimmed, true);
    }, this.debounceMs);
  }

  submit(): void {
    this.cancelTimer();
    const trimmed = this.query.trim();
    if (trimmed.length < SEARCH_MIN_LENGTH) {
      this.resetResults();
      return;
    }
    void this.run(trimmed, true);
  }

  setFilters(patch: Partial<SearchFilters>): void {
    this.cancelTimer();
    this.filters = {
      ...this.filters,
      ...patch,
      kinds: patch.kinds ? [...patch.kinds] : this.filters.kinds,
    };
    const query = this.appliedQuery || this.query.trim();
    if (query.length >= SEARCH_MIN_LENGTH) {
      void this.run(query, true);
    }
  }

  clearFilters(): void {
    this.setFilters(emptySearchFilters());
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
    return this.runPage(this.appliedQuery, this.cursor);
  }

  retry(): void {
    if (this.appliedQuery.length >= SEARCH_MIN_LENGTH) {
      void this.run(this.appliedQuery, true);
    }
  }

  resetResults(): void {
    this.token++;
    this.appliedQuery = "";
    this.hits = [];
    this.page = 0;
    this.hasMore = false;
    this.loading = false;
    this.loadingMore = false;
    this.searched = false;
    this.error = null;
    this.notice = null;
    this.relaxed = false;
    this.cursor = null;
  }

  dispose(): void {
    this.cancelTimer();
    this.token++;
  }

  dismissError(): void {
    this.error = null;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.scheduler.clear(this.timer);
      this.timer = null;
    }
  }

  private async run(query: string, reset: boolean): Promise<void> {
    this.resetInFlight(query);
    if (reset) {
      this.appliedQuery = query;
    }
    await this.runPage(query, reset ? undefined : this.cursor ?? undefined);
  }

  private resetInFlight(query: string): void {
    if (this.projectId === null) {
      this.resetResults();
      return;
    }
    this.token++;
    runInAction(() => {
      this.loading = true;
      this.loadingMore = false;
      this.error = null;
      this.notice = null;
      if (this.appliedQuery !== query) {
        this.hits = [];
        this.searched = false;
      }
    });
  }

  private async runPage(query: string, cursor?: string): Promise<void> {
    const projectId = this.projectId;
    if (!projectId) {
      return;
    }
    const token = this.token;
    const appending = cursor !== undefined && cursor === this.cursor;
    if (appending) {
      runInAction(() => {
        this.loadingMore = true;
      });
    }
    try {
      const page: SearchPage = await this.api.search({
        query,
        projectId,
        filters: this.filters,
        limit: SEARCH_PAGE_SIZE,
        cursor,
      });
      if (token !== this.token || projectId !== this.projectId) {
        return;
      }
      runInAction(() => {
        this.hits = appending ? [...this.hits, ...page.hits] : page.hits;
        this.page = page.page;
        this.hasMore = page.hasMore;
        this.cursor = page.nextCursor ?? null;
        this.notice = page.notice ?? null;
        this.relaxed = page.relaxed;
        this.searched = true;
        this.appliedQuery = page.query || query;
      });
    } catch (cause) {
      if (token !== this.token || projectId !== this.projectId) {
        return;
      }
      runInAction(() => {
        this.error = errorMessage(cause);
        this.searched = true;
      });
    } finally {
      if (token === this.token) {
        runInAction(() => {
          this.loading = false;
          this.loadingMore = false;
        });
      }
    }
  }
}
