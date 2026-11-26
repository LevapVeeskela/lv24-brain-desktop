import { makeAutoObservable, runInAction } from "mobx";
import { ideasApi } from "@/entities/ideas/api/ideasApi";
import {
  IDEA_REMIND_MAX,
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
  sortIdeas,
  todayPreview,
  type IdeaGroup,
} from "./focus";
import { parseLocalDateKey } from "./format";

export type IdeasView = "focus" | "all" | "calendar";
export type IdeaScope = "all" | "project";
export type IdeaAction = "complete" | "reopen" | "save" | "trash" | "restore";

/** The engine's list maximum; the page has no pager, so ask for everything. */
const IDEA_LIST_LIMIT = 1000;

export interface IdeasStoreOptions {
  /** Injectable clock keeps grouping and due chips deterministic in tests. */
  now?: () => Date;
  /**
   * WS8 integration point: the desktop reminder settings pass their
   * `defaultLeadMinutes` getter here. The store writes the concrete value into
   * new ideas and edits that leave the reminder untouched; an explicit record
   * value always wins.
   */
  defaultLeadMinutes?: () => number | null | undefined;
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
  /** Observable clock snapshot; computeds refresh when this changes. */
  nowAt = 0;

  private readonly source: IdeasSource;
  private readonly clock: () => Date;
  private defaultLeadMinutes?: () => number | null | undefined;
  private listToken = 0;
  private detailToken = 0;
  private inFlight: Promise<void> | null = null;
  private saveChain: Promise<unknown> = Promise.resolve();
  private clockTimer: ReturnType<typeof setInterval> | null = null;

  constructor(source: IdeasSource = ideasApi, options: IdeasStoreOptions = {}) {
    this.source = source;
    this.clock = options.now ?? (() => new Date());
    this.defaultLeadMinutes = options.defaultLeadMinutes;
    this.nowAt = this.clock().getTime();
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /**
   * WS8 integration point: the reminders settings provider installs its live
   * `defaultLeadMinutes` getter here once the settings load, and clears it on
   * teardown. The value is read at write time and stored concretely.
   */
  setDefaultLeadMinutes(
    source: (() => number | null | undefined) | null,
  ): void {
    this.defaultLeadMinutes = source ?? undefined;
  }

  /** Current clock value for row formatting; not a cached MobX computed. */
  nowDate(): Date {
    return new Date(this.nowAt);
  }

  /** Re-reads the clock so day-based computeds invalidate around midnight. */
  refreshNow(): void {
    this.nowAt = this.clock().getTime();
  }

  /** Minute tick while the app shell is alive; `dispose` clears it. */
  startClock(intervalMs = 60_000): void {
    if (this.clockTimer !== null) {
      return;
    }
    this.clockTimer = setInterval(() => this.refreshNow(), intervalMs);
  }

  dispose(): void {
    if (this.clockTimer !== null) {
      clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  /** Global count for the rail badge; ignores the page scope. */
  get openCount(): number {
    return openIdeaCount(this.items);
  }

  get dueTodayCount(): number {
    return dueTodayCount(this.items, new Date(this.nowAt));
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
    return groupIdeas(this.scoped, new Date(this.nowAt));
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
    return todayPreview(this.items, new Date(this.nowAt), 3);
  }

  load(options: { force?: boolean } = {}): Promise<void> {
    if (this.inFlight) {
      // A forced refresh must observe writes that happened after the current
      // read started; wait for it, then run a fresh read.
      return options.force
        ? this.inFlight.then(() => this.load({ force: true }))
        : this.inFlight;
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
    this.refreshNow();
  }

  setScope(scope: IdeaScope): void {
    const next = scope === "project" && !this.projectId ? "all" : scope;
    if (this.scope === next) {
      return;
    }
    this.scope = next;
    this.cursorId = null;
    this.refreshNow();
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
    this.refreshNow();
  }

  setQuery(query: string): void {
    if (this.query === query) {
      return;
    }
    this.query = query;
    this.cursorId = null;
    this.refreshNow();
  }

  setShowDone(showDone: boolean): void {
    this.showDone = showDone;
    if (
      !showDone &&
      !this.query.trim() &&
      this.cursorId &&
      this.items.some(
        (idea) => idea.id === this.cursorId && isClosedIdeaStatus(idea.status),
      )
    ) {
      this.cursorId = null;
    }
    this.refreshNow();
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
    // List rows omit the body; the detail read fills it before the drawer is
    // used for editing.
    void this.loadDetail(ideaId, ++this.detailToken);
  }

  closeDrawer(): void {
    this.drawerId = null;
  }

  /**
   * Title-only capture. `dueDate` is the calendar's all-day prefill; it is
   * validated here so a malformed key never reaches the source.
   */
  async quickAdd(
    title: string,
    options: { dueDate?: string } = {},
  ): Promise<boolean> {
    const value = title.trim();
    if (!value || this.quickAddBusy) {
      return false;
    }
    this.refreshNow();
    const dueDate =
      options.dueDate && parseLocalDateKey(options.dueDate)
        ? options.dueDate
        : undefined;
    runInAction(() => {
      this.quickAddBusy = true;
      this.quickAddError = null;
    });
    try {
      const lead = this.defaultLead();
      const input: IdeaCreateInput = {
        title: value,
        projectId: this.projectId ?? "personal",
        source: { type: "desktop" },
        ...(lead === null ? {} : { remindBeforeMinutes: lead }),
        ...(dueDate ? { dueDate } : {}),
      };
      const created = await this.source.create(input);
      runInAction(() => {
        this.items = [...this.items, created];
        this.loaded = true;
        this.cursorId = created.id;
      });
      await this.refresh();
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
    this.refreshNow();
    const current = this.items.find((idea) => idea.id === ideaId);
    if (!current) {
      return false;
    }
    const closing = !isClosedIdeaStatus(current.status);
    const previous: Idea = { ...current, tags: [...current.tags] };
    const stamp = new Date(this.nowAt).toISOString();
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
      await this.refresh();
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
    this.refreshNow();
    const stamp = new Date(this.nowAt).toISOString();
    runInAction(() => {
      this.action = "reopen";
      this.actionId = previous.id;
      this.actionError = null;
      this.replace({ ...previous, updatedAt: stamp });
    });
    try {
      // The engine only reopens done/dropped to `open`; restoring a `doing`
      // or `someday` idea is a second allowed transition from `open`.
      const reopened = await this.source.update(previous.id, {
        status: "open",
      });
      const saved =
        previous.status === "open"
          ? reopened
          : await this.source.update(previous.id, {
              status: previous.status,
            });
      runInAction(() => {
        this.replace(saved);
        this.lastCompleted = null;
      });
      await this.refresh();
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
    this.refreshNow();
    runInAction(() => {
      this.action = "save";
      this.actionId = ideaId;
      this.actionError = null;
    });
    try {
      const saved = await this.source.update(
        ideaId,
        this.withDefaultLead(ideaId, patch),
      );
      runInAction(() => {
        this.replace(saved);
      });
      await this.refresh();
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
    this.refreshNow();
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
      await this.refresh();
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
    this.refreshNow();
    runInAction(() => {
      this.action = "restore";
      this.actionId = trashed.id;
      this.actionError = null;
    });
    try {
      const restored = await this.source.restore(trashed.id);
      runInAction(() => {
        this.replace(restored);
        this.cursorId = restored.id;
        this.lastTrashed = null;
      });
      await this.refresh();
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

  /** The concrete desktop lead, or null when reminders are off. */
  private defaultLead(): number | null {
    const minutes = this.defaultLeadMinutes?.();
    if (minutes === undefined || minutes === null) {
      return null;
    }
    const value = Math.trunc(minutes);
    return value > 0 && value <= IDEA_REMIND_MAX ? value : null;
  }

  /**
   * Applies the desktop default lead when a content edit does not touch the
   * reminder. An explicit stored value always wins, a status/completion-only
   * change never adds a lead, and the record receives the concrete minutes,
   * never a hidden "use default" marker.
   */
  private withDefaultLead(
    ideaId: string,
    patch: IdeaUpdateInput,
  ): IdeaUpdateInput {
    if (patch.remindBeforeMinutes !== undefined) {
      return patch;
    }
    const current = this.items.find((idea) => idea.id === ideaId);
    if (!current || current.remindBeforeMinutes) {
      return patch;
    }
    const touchesContent =
      patch.title !== undefined ||
      patch.body !== undefined ||
      patch.projectId !== undefined ||
      patch.priority !== undefined ||
      patch.dueAt !== undefined ||
      patch.dueDate !== undefined ||
      patch.tags !== undefined;
    if (!touchesContent || patch.completionNote !== undefined) {
      return patch;
    }
    // A lead without a due instant is inert; only edit a dated idea.
    const dueCleared = patch.dueAt === null && patch.dueDate === null;
    const hasDue =
      !dueCleared &&
      Boolean(patch.dueAt ?? patch.dueDate ?? current.dueAt ?? current.dueDate);
    if (!hasDue) {
      return patch;
    }
    const lead = this.defaultLead();
    return lead === null ? patch : { ...patch, remindBeforeMinutes: lead };
  }

  /**
   * Reads the full row (with body) for the open drawer. A stale response is
   * dropped, and a row that was trashed meanwhile is not resurrected.
   */
  private async loadDetail(ideaId: string, token: number): Promise<void> {
    try {
      const detail = await this.source.get(ideaId);
      if (token !== this.detailToken) {
        return;
      }
      runInAction(() => {
        if (this.items.some((idea) => idea.id === ideaId)) {
          this.replace(detail);
        }
      });
    } catch (cause) {
      if (token !== this.detailToken) {
        return;
      }
      runInAction(() => {
        this.actionError = errorMessage(cause);
      });
    }
  }

  private async performLoad(): Promise<void> {
    const token = ++this.listToken;
    runInAction(() => {
      this.nowAt = this.clock().getTime();
      this.loading = true;
      this.error = null;
    });
    try {
      const filter: IdeaFilter = { limit: IDEA_LIST_LIMIT };
      const result = await this.source.list(filter);
      if (token !== this.listToken) {
        return;
      }
      runInAction(() => {
        // List rows omit the body. Keep the open drawer's loaded body across a
        // refresh so editing a field cannot blank the textarea.
        const openDetail =
          this.drawerId === null
            ? null
            : (this.items.find((idea) => idea.id === this.drawerId) ?? null);
        const rows = result.ideas.map((idea) =>
          openDetail !== null &&
          idea.id === openDetail.id &&
          !idea.body &&
          openDetail.body
            ? { ...idea, body: openDetail.body }
            : idea,
        );
        this.items = rows;
        this.problems = result.problems;
        this.loaded = true;
        // A refresh after a mutation must not move the selection; only a row
        // that truly vanished (trash, another writer) clears the cursor.
        const ids = new Set(rows.map((idea) => idea.id));
        if (this.drawerId !== null && !ids.has(this.drawerId)) {
          this.drawerId = null;
        }
        if (this.cursorId !== null && !ids.has(this.cursorId)) {
          this.cursorId = null;
        }
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
