import { makeAutoObservable, runInAction } from "mobx";
import { LocalApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import type { RecordReviewRequest } from "./types";
import { RecordEditor } from "./RecordEditor";
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

function queryFromFilters(
  filters: RecordFilters,
  limit: number,
  allProjects: boolean,
): RecordListQuery {
  return {
    kinds: filters.kinds.length ? [...filters.kinds] : undefined,
    status: filters.status || undefined,
    scope: filters.scope || undefined,
    subtype: filters.subtype.trim() || undefined,
    topic: filters.topic.trim() || undefined,
    dueReview: filters.dueReview,
    allProjects: allProjects || undefined,
    limit,
  };
}

export class MemoryStore {
  readonly editor: RecordEditor;
  projectId: string | null = null;
  filters: RecordFilters = emptyRecordFilters();
  /** Reads every project the agent allowlist serves instead of one project. */
  allProjects = false;
  items: MemoryRecord[] = [];
  page = 0;
  hasMore = false;
  loading = false;
  loadingMore = false;
  loaded = false;
  error: string | null = null;
  errorCode: string | null = null;

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

  recordAction: "trash" | "restore" | "review" | null = null;
  recordActionId: string | null = null;
  recordActionError: string | null = null;
  lastTrashed: MemoryRecord | null = null;

  private readonly api: MemorySource;
  private cursor: string | null = null;
  private listToken = 0;
  private detailToken = 0;
  private recentToken = 0;
  private catchupToken = 0;
  private listInFlight: Promise<void> | null = null;

  constructor(api: MemorySource) {
    this.api = api;
    this.editor = new RecordEditor(api, (detail) => this.applySavedRecord(detail));
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

  setAllProjects(value: boolean): void {
    if (this.allProjects === value) {
      return;
    }
    this.allProjects = value;
    this.invalidateList();
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
        ...queryFromFilters(this.filters, RECORD_PAGE_SIZE, this.allProjects),
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
              this.errorCode =
                cause instanceof LocalApiError ? cause.code : null;
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

  /** Moves one live record to the project trash and refreshes the list. */
  async trash(projectId: string, recordId: string): Promise<boolean> {
    if (this.recordAction) {
      return false;
    }
    runInAction(() => {
      this.recordAction = "trash";
      this.recordActionId = recordId;
      this.recordActionError = null;
    });
    try {
      const trashed = await this.api.trashRecord(projectId, recordId);
      runInAction(() => {
        this.lastTrashed = trashed;
        this.items = this.items.filter(
          (item) =>
            !(
              item.id === trashed.id &&
              item.projectId === trashed.projectId
            ),
        );
        if (this.detailId === recordId) {
          this.clearDetail();
        }
      });
      this.reloadActiveList(projectId);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.recordActionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.recordAction = null;
        this.recordActionId = null;
      });
    }
  }

  /** Reverses a trash move; the record keeps its id, file and edited text. */
  async restore(projectId: string, recordId: string): Promise<boolean> {
    if (this.recordAction) {
      return false;
    }
    runInAction(() => {
      this.recordAction = "restore";
      this.recordActionId = recordId;
      this.recordActionError = null;
    });
    try {
      const restored = await this.api.restoreRecord(projectId, recordId);
      runInAction(() => {
        if (this.lastTrashed?.id === restored.id) {
          this.lastTrashed = null;
        }
      });
      this.reloadActiveList(projectId);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.recordActionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.recordAction = null;
        this.recordActionId = null;
      });
    }
  }

  restoreLast(): Promise<boolean> {
    const trashed = this.lastTrashed;
    return trashed ? this.restore(trashed.projectId, trashed.id) : Promise.resolve(false);
  }

  /**
   * Marks one unreviewed record reviewed with a trust override. The write is
   * provenance-only and a compare-and-swap on the `updated_at` the client read,
   * so a stale value is a 409 conflict that writes nothing. The open detail and
   * the list row flip to reviewed optimistically and settle from the response.
   */
  async review(
    projectId: string,
    recordId: string,
    request: RecordReviewRequest,
  ): Promise<boolean> {
    if (this.recordAction) {
      return false;
    }
    const before = this.detail;
    const optimistic =
      before && before.id === recordId
        ? {
            ...before,
            provenance: {
              ...before.provenance,
              reviewed: true,
              trust: request.trust ?? before.provenance.trust,
            },
          }
        : before;
    runInAction(() => {
      this.recordAction = "review";
      this.recordActionId = recordId;
      this.recordActionError = null;
      if (optimistic) {
        this.detail = optimistic;
      }
    });
    try {
      const reviewed = await this.api.reviewRecord(projectId, recordId, {
        ...request,
        reviewed: true,
      });
      runInAction(() => {
        this.recordAction = null;
        this.recordActionId = null;
      });
      if (this.detail && this.detail.id === recordId) {
        this.detail = {
          ...this.detail,
          provenance: reviewed.provenance,
          review: reviewed.review,
        };
      }
      this.reloadActiveList(projectId);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.recordAction = null;
        this.recordActionId = null;
        this.recordActionError = errorMessage(cause);
        if (before) {
          this.detail = before;
        }
      });
      if (
        cause instanceof LocalApiError &&
        cause.status === 409 &&
        this.detail?.id === recordId
      ) {
        void this.loadDetail(projectId, recordId, { force: true });
      }
      return false;
    }
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
    this.errorCode = null;
    this.detailError = null;
    this.recentError = null;
    this.catchupError = null;
    this.recordActionError = null;
  }

  /** Optimistically patches the open detail and the list row after an edit. */
  private applySavedRecord(detail: RecordDetail): void {
    this.detail = detail;
    this.items = this.items.map((item) =>
      item.id === detail.id && item.projectId === detail.projectId
        ? detail
        : item,
    );
    this.reloadActiveList(detail.projectId);
  }

  /**
   * Refreshes the list only when the changed record belongs to the loaded
   * scope. Editing a record opened from another project must not retarget the
   * browser or leave the page waiting for a different project.
   */
  private reloadActiveList(projectId: string): void {
    if (this.allProjects && this.projectId) {
      void this.load(this.projectId, { force: true });
      return;
    }
    if (this.projectId === projectId) {
      void this.load(projectId, { force: true });
    }
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
    this.errorCode = null;
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
        queryFromFilters(this.filters, RECORD_PAGE_SIZE, this.allProjects),
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
        this.errorCode = null;
      });
    } catch (cause) {
      if (token !== this.listToken) {
        return;
      }
      runInAction(() => {
        this.error = errorMessage(cause);
        this.errorCode = cause instanceof LocalApiError ? cause.code : null;
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
