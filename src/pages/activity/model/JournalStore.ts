import { makeAutoObservable, runInAction } from "mobx";
import type { JournalEntry } from "@/entities/memory/model/types";
import { errorMessage } from "@/shared/lib/errors";
import { journalApi, type JournalSource } from "../api/journalApi";

/** The engine bounds one page at 200; pages grow by 50. */
export const JOURNAL_PAGE_SIZE = 50;
export const JOURNAL_MAX_LIMIT = 200;

/**
 * Project-scoped journal reader. The route has no cursor, so "load more"
 * widens the limit and re-reads the newest page.
 */
export class JournalStore {
  projectId: string | null = null;
  items: JournalEntry[] = [];
  limit = JOURNAL_PAGE_SIZE;
  hasMore = false;
  loading = false;
  loaded = false;
  error: string | null = null;

  private readonly api: JournalSource;
  private token = 0;

  constructor(api: JournalSource = journalApi) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get canLoadMore(): boolean {
    return this.hasMore && this.limit < JOURNAL_MAX_LIMIT;
  }

  load(projectId: string | null, options: { force?: boolean } = {}): Promise<void> {
    if (
      this.projectId === projectId &&
      this.loaded &&
      !options.force
    ) {
      return Promise.resolve();
    }
    const reset = this.projectId !== projectId;
    this.projectId = projectId;
    return this.performLoad(reset ? JOURNAL_PAGE_SIZE : this.limit, reset);
  }

  loadMore(): Promise<void> {
    if (this.loading || !this.canLoadMore) {
      return Promise.resolve();
    }
    const nextLimit = Math.min(
      this.limit + JOURNAL_PAGE_SIZE,
      JOURNAL_MAX_LIMIT,
    );
    return this.performLoad(nextLimit, false);
  }

  reset(): void {
    this.token++;
    this.projectId = null;
    this.items = [];
    this.limit = JOURNAL_PAGE_SIZE;
    this.hasMore = false;
    this.loading = false;
    this.loaded = false;
    this.error = null;
  }

  private async performLoad(limit: number, reset: boolean): Promise<void> {
    const projectId = this.projectId;
    const token = ++this.token;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const page = await this.api.read(projectId, limit);
      if (token !== this.token) {
        return;
      }
      runInAction(() => {
        this.items = reset ? page.items : mergeEntries(this.items, page.items);
        this.limit = page.limit;
        this.hasMore = page.hasMore;
        this.loaded = true;
      });
    } catch (cause) {
      if (token === this.token) {
        runInAction(() => {
          this.error = errorMessage(cause);
        });
      }
    } finally {
      if (token === this.token) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }
}

/** The route returns the newest page; a wider page already contains it. */
function mergeEntries(
  current: JournalEntry[],
  next: JournalEntry[],
): JournalEntry[] {
  const seen = new Set(next.map(entryKey));
  return [...next, ...current.filter((entry) => !seen.has(entryKey(entry)))];
}

function entryKey(entry: JournalEntry): string {
  return `${entry.time}|${entry.event}|${entry.id ?? ""}|${entry.project ?? ""}`;
}
