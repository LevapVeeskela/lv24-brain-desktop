import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { Project } from "./types";

export interface ProjectsSource {
  list(): Promise<Project[]>;
}

export class ProjectsStore {
  items: Project[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;

  private readonly api: ProjectsSource;
  private inFlight: Promise<void> | null = null;

  constructor(api: ProjectsSource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
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

  dismissError(): void {
    this.error = null;
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
