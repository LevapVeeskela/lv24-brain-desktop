import { listen } from "@tauri-apps/api/event";
import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import { engineApi } from "../api/engineApi";
import type {
  AutostartStatus,
  EngineAction,
  EnginePhase,
  EngineStatus,
  ShellStatus,
} from "./types";

const POLL_INTERVAL_MS = 4000;

export class EngineStore {
  status: ShellStatus | null = null;
  busy: EngineAction = null;
  error: string | null = null;
  oauthCallback: string | null = null;

  private started = false;
  private generation = 0;
  private refreshInFlight = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get engine(): EngineStatus | null {
    return this.status?.engine ?? null;
  }

  get phase(): EnginePhase {
    return this.status?.engine.phase ?? "starting";
  }

  get isRunning(): boolean {
    return this.status?.engine.running ?? false;
  }

  get isPaused(): boolean {
    return this.status?.engine.phase === "paused";
  }

  get isUpdating(): boolean {
    return this.status?.updating ?? false;
  }

  get autostart(): AutostartStatus | null {
    return this.status?.autostart ?? null;
  }

  get version(): string | null {
    return this.status?.engine.version ?? null;
  }

  get desktopVersion(): string {
    return this.status?.desktopVersion ?? "0.1.0";
  }

  get deepLinkScheme(): string {
    return this.status?.deepLinkScheme ?? "lv24brain";
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const generation = ++this.generation;
    void this.refresh();
    void this.bindEvents(generation);
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    void engineApi
      .takeDeepLink()
      .then((url) => {
        if (url && generation === this.generation) {
          runInAction(() => {
            this.oauthCallback = url;
          });
        }
      })
      .catch(() => undefined);
  }

  dispose(): void {
    this.started = false;
    this.generation += 1;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const unsubscribers = this.unsubscribers.splice(0);
    for (const unsubscribe of unsubscribers) {
      try {
        unsubscribe();
      } catch {
        // Listener cleanup is best effort.
      }
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshInFlight) {
      return;
    }
    this.refreshInFlight = true;
    try {
      const next = await engineApi.status();
      runInAction(() => {
        this.status = next;
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      this.refreshInFlight = false;
    }
  }

  async startEngine(): Promise<boolean> {
    this.busy = "start";
    this.error = null;
    try {
      const next = await engineApi.start();
      runInAction(() => {
        this.status = next;
        this.busy = null;
      });
      return next.engine.running;
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.busy = null;
      });
      return false;
    }
  }

  async pauseEngine(): Promise<boolean> {
    this.busy = "pause";
    this.error = null;
    try {
      const next = await engineApi.pause();
      runInAction(() => {
        this.status = next;
        this.busy = null;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.busy = null;
      });
      return false;
    }
  }

  async setAutostart(enabled: boolean): Promise<boolean> {
    this.busy = "autostart";
    this.error = null;
    try {
      const next = await engineApi.setAutostart(enabled);
      runInAction(() => {
        this.status = next;
        this.busy = null;
      });
      return true;
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.busy = null;
      });
      return false;
    }
  }

  async quit(): Promise<void> {
    this.busy = "quit";
    try {
      await engineApi.quit();
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.busy = null;
      });
    }
  }

  dismissError(): void {
    this.error = null;
  }

  dismissOAuthCallback(): void {
    this.oauthCallback = null;
  }

  private async bindEvents(generation: number): Promise<void> {
    try {
      const unsubscribers = await Promise.all([
        listen<EngineStatus>("engine-status", (event) => {
          runInAction(() => {
            if (this.status) {
              this.status = { ...this.status, engine: event.payload };
            }
          });
          // The event only carries EngineStatus; refresh to pick up changed
          // shell-level fields such as persisted pause and autostart.
          void this.refresh();
        }),
        listen<string[]>("oauth-callback", (event) => {
          runInAction(() => {
            this.oauthCallback = event.payload[0] ?? null;
          });
        }),
        listen<string>("shell-error", (event) => {
          runInAction(() => {
            this.error = event.payload;
          });
        }),
      ]);
      if (!this.started || generation !== this.generation) {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
        return;
      }
      this.unsubscribers.push(...unsubscribers);
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    }
  }
}
