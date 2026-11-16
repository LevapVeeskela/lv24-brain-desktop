import { makeAutoObservable, runInAction } from "mobx";
import { LocalApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import type { ProjectsSource } from "../api/projectApi";
import type {
  Project,
  ProjectState,
  ProjectStatePatch,
  StateSaveResult,
} from "./types";

export class ProjectsStore {
  items: Project[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;
  selectedId: string | null = null;

  state: ProjectState | null = null;
  stateProjectId: string | null = null;
  stateLoading = false;
  stateLoaded = false;
  stateError: string | null = null;
  saving = false;
  saveError: string | null = null;
  stateConflict = false;
  conflictRevision: string | null = null;

  private readonly api: ProjectsSource;
  private inFlight: Promise<void> | null = null;
  private stateToken = 0;

  constructor(api: ProjectsSource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get selected(): Project | null {
    return this.items.find((project) => project.id === this.selectedId) ?? null;
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

  select(projectId: string | null): void {
    if (this.selectedId === projectId) {
      return;
    }
    this.selectedId = projectId;
    if (this.stateProjectId !== projectId) {
      this.stateToken++;
      this.state = null;
      this.stateProjectId = null;
      this.stateLoading = false;
      this.stateLoaded = false;
      this.stateError = null;
      this.saveError = null;
      this.stateConflict = false;
      this.conflictRevision = null;
    }
  }

  loadState(
    projectId: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (
      this.stateProjectId === projectId &&
      this.stateLoaded &&
      !options.force
    ) {
      return Promise.resolve();
    }
    const token = ++this.stateToken;
    return this.performStateLoad(projectId, token);
  }

  async saveState(
    projectId: string,
    patch: ProjectStatePatch,
  ): Promise<StateSaveResult> {
    const current = this.stateProjectId === projectId ? this.state : null;
    runInAction(() => {
      this.saving = true;
      this.saveError = null;
      this.stateConflict = false;
    });
    try {
      const next = await this.api.saveState(
        projectId,
        patch,
        current?.revision,
      );
      runInAction(() => {
        this.state = next;
        this.stateProjectId = projectId;
        this.stateLoaded = true;
        this.stateConflict = false;
        this.conflictRevision = null;
      });
      return "saved";
    } catch (cause) {
      const conflict =
        cause instanceof LocalApiError &&
        (cause.status === 409 || cause.code === "conflict");
      runInAction(() => {
        if (conflict) {
          this.stateConflict = true;
          this.conflictRevision = cause.currentRevision ?? null;
        }
        this.saveError = errorMessage(cause);
      });
      if (conflict) {
        void this.loadState(projectId, { force: true });
      }
      return conflict ? "conflict" : "error";
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  clearConflict(): void {
    this.stateConflict = false;
    this.conflictRevision = null;
    this.saveError = null;
  }

  dismissError(): void {
    this.error = null;
    this.stateError = null;
    this.saveError = null;
  }

  private async performLoad(): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const items = await this.api.list();
      runInAction(() => {
        this.items = items;
        this.loaded = true;
        const selectedExists = items.some(
          (project) => project.id === this.selectedId,
        );
        if (!selectedExists) {
          this.select(items[0]?.id ?? null);
        }
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

  private async performStateLoad(
    projectId: string,
    token: number,
  ): Promise<void> {
    runInAction(() => {
      if (this.stateProjectId !== projectId) {
        this.state = null;
      }
      this.stateProjectId = projectId;
      this.stateLoading = true;
      this.stateError = null;
    });
    try {
      const state = await this.api.state(projectId);
      if (token !== this.stateToken) {
        return;
      }
      runInAction(() => {
        this.state = state;
        this.stateLoaded = true;
      });
    } catch (cause) {
      if (token !== this.stateToken) {
        return;
      }
      runInAction(() => {
        this.stateError = errorMessage(cause);
      });
    } finally {
      if (token === this.stateToken) {
        runInAction(() => {
          this.stateLoading = false;
        });
      }
    }
  }
}
