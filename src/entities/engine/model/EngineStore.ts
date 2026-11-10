import { listen } from "@tauri-apps/api/event";
import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import { engineApi } from "../api/engineApi";
import type {
  AutostartStatus,
  EngineAction,
  EngineStatus,
  EngineViewPhase,
  ShellStatus,
} from "./types";

const POLL_INTERVAL_MS = 4000;

export class EngineStore {
  status: ShellStatus | null = null;
  busy: EngineAction = null;
  error: string | null = null;
  statusError: string | null = null;
  autostartError: string | null = null;
  oauthCallback: string | null = null;
  sessionRecoveryDismissed = false;

  private lastAutostartTarget: boolean | null = null;
  private started = false;
  private generation = 0;
  private refreshInFlight = false;
  private statusRefreshFailed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribers: Array<() => void> = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get engine(): EngineStatus | null {
    return this.status?.engine ?? null;
  }

  get phase(): EngineViewPhase {
    if (this.status) {
      return this.status.engine.phase;
    }
    // Stay unavailable after a failed first status call, even when the user
    // dismisses the banner: without a status we cannot claim to be starting.
    return this.statusRefreshFailed ? "unavailable" : "initializing";
  }

  get isRunning(): boolean {
    return this.status?.engine.running ?? false;
  }

  get isPaused(): boolean {
    return this.phase === "paused";
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

  get logDir(): string | null {
    return this.status?.logDir ?? null;
  }

  get previousSessionUnclean(): boolean {
    return this.status?.previousSessionUnclean ?? false;
  }

  get sessionDiagnosticsAvailable(): boolean {
    return this.status?.sessionDiagnosticsAvailable ?? false;
  }

  /**
   * The recovery notice is shown once per desktop session. Dismissal lives in
   * memory only, so the next abrupt exit is reported again after a restart.
   */
  get sessionRecoveryNoticeVisible(): boolean {
    return this.previousSessionUnclean && !this.sessionRecoveryDismissed;
  }

  dismissSessionRecoveryNotice(): void {
    this.sessionRecoveryDismissed = true;
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
        this.statusError = null;
        this.statusRefreshFailed = false;
      });
    } catch (cause) {
      // Poll failures are background state, not the outcome of a user action.
      // Keeping them apart lets Dismiss hide the banner without losing a
      // start/pause/autostart error and without faking an initializing phase.
      runInAction(() => {
        this.statusError = errorMessage(cause);
        this.statusRefreshFailed = true;
      });
    } finally {
      this.refreshInFlight = false;
    }
  }

  async startEngine(): Promise<boolean> {
    if (this.busy !== null) {
      return false;
    }
    if (this.isUpdating) {
      // The installer is replacing the agent binaries. Starting the agent now
      // would race the update and could leave a half-updated process running.
      this.error =
        "The brain agent is updating. Start it again after the update finishes.";
      return false;
    }
    this.busy = "start";
    this.error = null;
    try {
      const next = await engineApi.start();
      runInAction(() => {
        this.status = next;
        this.statusError = null;
        this.statusRefreshFailed = false;
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
    // Pausing is only meaningful for a running agent. A stale or error state
    // must never persist `paused`, otherwise the next start stays suspended.
    if (this.phase !== "running" || this.busy !== null || this.isUpdating) {
      return false;
    }
    this.busy = "pause";
    this.error = null;
    try {
      const next = await engineApi.pause();
      runInAction(() => {
        this.status = next;
        this.statusError = null;
        this.statusRefreshFailed = false;
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
    if (this.busy !== null || this.isUpdating) {
      return false;
    }
    this.busy = "autostart";
    this.error = null;
    this.autostartError = null;
    this.lastAutostartTarget = enabled;
    try {
      const next = await engineApi.setAutostart(enabled);
      runInAction(() => {
        this.status = next;
        this.statusError = null;
        this.statusRefreshFailed = false;
        this.busy = null;
        this.lastAutostartTarget = null;
      });
      return true;
    } catch (cause) {
      const message = errorMessage(cause);
      runInAction(() => {
        this.error = message;
        this.autostartError = message;
        this.busy = null;
      });
      return false;
    }
  }

  /** Retry the last failed autostart toggle with the same target value. */
  async retryAutostart(): Promise<boolean> {
    if (this.lastAutostartTarget === null || this.busy !== null) {
      return false;
    }
    return this.setAutostart(this.lastAutostartTarget);
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
    // Dismiss only the visible banners. `statusRefreshFailed` stays set so a
    // dismissed status error cannot masquerade as an engine that is starting.
    this.error = null;
    this.statusError = null;
    this.autostartError = null;
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
              this.statusError = null;
              this.statusRefreshFailed = false;
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
