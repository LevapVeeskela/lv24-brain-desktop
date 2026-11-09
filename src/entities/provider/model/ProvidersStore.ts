import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import type { ProviderDescriptor } from "./types";

export interface ProvidersSource {
  list(): Promise<ProviderDescriptor[]>;
}

export class ProvidersStore {
  items: ProviderDescriptor[] = [];
  loading = false;
  loaded = false;
  error: string | null = null;

  private readonly api: ProvidersSource;
  private inFlight: Promise<void> | null = null;

  constructor(api: ProvidersSource) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get count(): number {
    return this.items.length;
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

  find(provider: string): ProviderDescriptor | undefined {
    return this.items.find((item) => item.provider === provider);
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
