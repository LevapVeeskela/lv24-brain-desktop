import { makeAutoObservable, runInAction } from "mobx";
import {
  isClosedIdeaStatus,
  type Idea,
  type IdeaCreateInput,
  type IdeaFilter,
  type IdeaProblem,
  type IdeasSource,
  type IdeaUpdateInput,
} from "@/entities/ideas/model/types";
import { errorMessage } from "@/shared/lib/errors";
import {
  dueTodayCount,
  filterIdeas,
  groupIdeas,
  openIdeaCount,
  overdueCount,
  sortIdeas,
  todayPreview,
  type IdeaGroup,
} from "./focus";

export type IdeasView = "focus" | "all";
export type IdeaScope = "all" | "project";
export type IdeaAction = "complete" | "reopen" | "save" | "trash" | "restore";

export interface IdeasStoreOptions {
  /** Injectable clock keeps grouping and due chips deterministic in tests. */
  now?: () => Date;
}

export class IdeasStore {
  items: Idea[] = [];
  problems: IdeaProblem[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;

  view: IdeasView = "focus";
  scope: IdeaScope = "all";
  /** Current shell project; the page keeps it in sync with the rail. */
  projectId: string | null = null;
  query = "";
  showDone = false;

  cursorId: string | null = null;
  drawerId: string | null = null;

  quickAddBusy = false;
  quickAddError: string | null = null;

  action: IdeaAction | null = null;
  actionId: string | null = null;
  actionError: string | null = null;
  lastTrashed: Idea | null = null;
  lastCompleted: Idea | null = null;

  private readonly source: IdeasSource;
  private readonly clock: () => Date;
  private listToken = 0;
  private inFlight: Promise<void> | null = null;
  private saveChain: Promise<unknown> = Promise.resolve();

  constructor(source: IdeasSource, options: IdeasStoreOptions = {}) {
    this.source = source;
    this.clock = options.now ?? (() => new Date());
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** Current clock value for row formatting; not a cached MobX computed. */
  nowDate(): Date {
    return this.clock();
  }

  /** Global count for the rail badge; ignores the page scope. */
  get openCount(): number {
    return openIdeaCount(this.items);
  }

  get dueTodayCount(): number {
    return dueTodayCount(this.items, this.clock());
  }

  get overdueCount(): number {
    return overdueCount(this.items, this.clock());
  }

  get scoped(): Idea[] {
    return filterIdeas(this.items, {
      scope: this.scope,
      projectId: this.projectId,
      query: this.query,
    });
  }

  /** Focus groups, always including Done; the page owns the collapse state. */
  get groups(): IdeaGroup[] {
    return groupIdeas(this.scoped, this.clock());
  }

  /** True when the Done group must be expanded without another click. */
  get doneExpanded(): boolean {
    return this.showDone || this.query.trim().length > 0;
  }

  get visible(): Idea[] {
    const list = sortIdeas(this.scoped);
    if (this.view === "focus" && !this.doneExpanded) {
      return list.filter((idea) => !isClosedIdeaStatus(idea.status));
    }
    return list;
  }

  get drawerIdea(): Idea | null {
    return this.items.find((idea) => idea.id === this.drawerId) ?? null;
  }

  get drawerOpen(): boolean {
    return this.drawerId !== null;
  }

  get todayPreview(): Idea[] {
    return todayPreview(this.items, this.clock(), 3);
  }

  load(options: { force?: boolean } = {}): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.loaded && !options.force) {
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

  refresh(): Promise<void> {
    return this.load({ force: true });
  }

  setView(view: IdeasView): void {
    if (this.view === view) {
      return;
    }
    this.view = view;
    this.cursorId = null;
  }

  setScope(scope: IdeaScope): void {
    const next = scope === "project" && !this.projectId ? "all" : scope;
    if (this.scope === next) {
      return;
    }
    this.scope = next;
    this.cursorId = null;
  }

  setProject(projectId: string | null): void {
    if (this.projectId === projectId) {
      return;
    }
    this.projectId = projectId;
    if (!projectId && this.scope === "project") {
      this.scope = "all";
    }
    this.cursorId = null;
  }

  setQuery(query: string): void {
    if (this.query === query) {
      return;
    }
    this.query = query;
    this.cursorId = null;
  }

  setShowDone(showDone: boolean): void {
    this.showDone = showDone;
  }

  setCursor(ideaId: string | null): void {
    this.cursorId = ideaId;
  }

  moveCursor(delta: number): void {
    const list = this.visible;
    if (list.length === 0) {
      return;
    }
    const index = list.findIndex((idea) => idea.id === this.cursorId);
    const next =
      index === -1
        ? delta > 0
          ? 0
          : list.length - 1
        : Math.min(list.length - 1, Math.max(0, index + delta));
    this.cursorId = list[next].id;
  }

  openDrawer(ideaId: string): void {
    if (!this.items.some((idea) => idea.id === ideaId)) {
      return;
    }
    this.drawerId = ideaId;
    this.cursorId = ideaId;
  }

  closeDrawer(): void {
    this.drawerId = null;
  }

  async quickAdd(title: string): Promise<boolean> {
    const value = title.trim();
    if (!value || this.quickAddBusy) {
      return false;
    }
    runInAction(() => {
      this.quickAddBusy = true;
      this.quickAddError = null;
    });
    try {
      const input: IdeaCreateInput = {
        title: value,
        projectId: this.projectId ?? "personal",
        source: { type: "desktop" },
      };
      const created = await this.source.create(input);
      runInAction(() => {
        this.items = [...this.items, created];
        this.loaded = true;
        this.cursorId = created.id;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.quickAddError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.quickAddBusy = false;
      });
    }
  }

  /**
   * Completes an open idea or reopens a closed one. The row flips immediately
   * and rolls back if the write fails; the previous value powers undo.
   */
  async toggleDone(ideaId: string): Promise<boolean> {
    if (this.action) {
      return false;
    }
    const current = this.items.find((idea) => idea.id === ideaId);
    if (!current) {
      return false;
    }
    const closing = !isClosedIdeaStatus(current.status);
    const previous: Idea = { ...current, tags: [...current.tags] };
    const stamp = this.clock().toISOString();
    const optimistic: Idea = closing
      ? { ...current, status: "done", completedAt: stamp, updatedAt: stamp }
      : {
          ...current,
          status: "open",
          completedAt: undefined,
          completionNote: undefined,
          updatedAt: stamp,
        };
    runInAction(() => {
      this.action = closing ? "complete" : "reopen";
      this.actionId = ideaId;
      this.actionError = null;
      this.replace(optimistic);
      if (closing) {
        this.lastCompleted = previous;
      } else if (this.lastCompleted?.id === ideaId) {
        this.lastCompleted = null;
      }
    });
    try {
      const saved = await this.source.update(
        ideaId,
        closing
          ? { status: "done" }
          : { status: "open", completedAt: null, completionNote: null },
      );
      runInAction(() => {
        this.replace(saved);
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.replace(previous);
        if (this.lastCompleted?.id === ideaId) {
          this.lastCompleted = null;
        }
        this.actionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.action = null;
        this.actionId = null;
      });
    }
  }

  async undoComplete(): Promise<boolean> {
    const previous = this.lastCompleted;
    if (!previous || this.action) {
      return false;
    }
    const stamp = this.clock().toISOString();
    runInAction(() => {
      this.action = "reopen";
      this.actionId = previous.id;
      this.actionError = null;
      this.replace({ ...previous, updatedAt: stamp });
    });
    try {
      const saved = await this.source.update(previous.id, {
        status: previous.status,
        completedAt: previous.completedAt ?? null,
        completionNote: previous.completionNote ?? null,
      });
      runInAction(() => {
        this.replace(saved);
        this.lastCompleted = null;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.lastCompleted = previous;
        this.actionError = errorMessage(cause);
        void this.load({ force: true });
      });
      return false;
    } finally {
      runInAction(() => {
        this.action = null;
        this.actionId = null;
      });
    }
  }

  /**
   * Serializes saves so a blur that lands while the previous PATCH is still in
   * flight is not dropped. Each patch is merged by the source, so idempotent
   * repeats are harmless.
   */
  save(ideaId: string, patch: IdeaUpdateInput): Promise<boolean> {
    if (Object.keys(patch).length === 0) {
      return Promise.resolve(false);
    }
    const task = this.saveChain.then(() => this.performSave(ideaId, patch));
    this.saveChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async performSave(
    ideaId: string,
    patch: IdeaUpdateInput,
  ): Promise<boolean> {
    runInAction(() => {
      this.action = "save";
      this.actionId = ideaId;
      this.actionError = null;
    });
    try {
      const saved = await this.source.update(ideaId, patch);
      runInAction(() => {
        this.replace(saved);
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.actionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.action = null;
        this.actionId = null;
      });
    }
  }

  /** Removes the row optimistically; `restoreLast` undoes the trash move. */
  async trash(ideaId: string): Promise<boolean> {
    if (this.action) {
      return false;
    }
    const previous = this.items;
    const current = this.items.find((idea) => idea.id === ideaId);
    if (!current) {
      return false;
    }
    runInAction(() => {
      this.action = "trash";
      this.actionId = ideaId;
      this.actionError = null;
      this.items = this.items.filter((idea) => idea.id !== ideaId);
      if (this.drawerId === ideaId) {
        this.drawerId = null;
      }
      if (this.cursorId === ideaId) {
        this.cursorId = null;
      }
    });
    try {
      const trashed = await this.source.trash(ideaId);
      runInAction(() => {
        this.lastTrashed = trashed;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.items = previous;
        this.actionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.action = null;
        this.actionId = null;
      });
    }
  }

  trashCursor(): Promise<boolean> {
    return this.cursorId ? this.trash(this.cursorId) : Promise.resolve(false);
  }

  async restoreLast(): Promise<boolean> {
    const trashed = this.lastTrashed;
    if (!trashed || this.action) {
      return false;
    }
    runInAction(() => {
      this.action = "restore";
      this.actionId = trashed.id;
      this.actionError = null;
    });
    try {
      const restored = await this.source.restore(trashed.id);
      runInAction(() => {
        this.replace(restored);
        this.lastTrashed = null;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.actionError = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.action = null;
        this.actionId = null;
      });
    }
  }

  dismissError(): void {
    this.error = null;
    this.actionError = null;
    this.quickAddError = null;
  }

  toggleDoneCursor(): Promise<boolean> {
    return this.cursorId ? this.toggleDone(this.cursorId) : Promise.resolve(false);
  }

  private replace(idea: Idea): void {
    let found = false;
    this.items = this.items.map((item) => {
      if (item.id !== idea.id) {
        return item;
      }
      found = true;
      return idea;
    });
    if (!found) {
      this.items = [...this.items, idea];
    }
  }

  private async performLoad(): Promise<void> {
    const token = ++this.listToken;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const filter: IdeaFilter = {};
      const result = await this.source.list(filter);
      if (token !== this.listToken) {
        return;
      }
      runInAction(() => {
        this.items = result.ideas;
        this.problems = result.problems;
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
