import { listen } from "@tauri-apps/api/event";
import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import { remindersApi } from "../api/remindersApi";
import {
  normalizePermission,
  readFocusEvent,
  readInAppReminder,
  readMissedEvent,
  type InAppReminder,
  type MissedDigest,
  type NotificationPermission,
  type ReminderEventListener,
  type RemindersDeps,
  type RemindersStatus,
  type ReminderSettings,
} from "./types";

const listenToTauri: ReminderEventListener = (event, handler) =>
  listen<unknown>(event, (payload) => handler(payload.payload));

export const defaultReminderDeps: RemindersDeps = {
  api: remindersApi,
  listen: listenToTauri,
  navigate: (hash) => {
    window.location.hash = hash;
  },
};

/**
 * Reminder state shared by the AppLayout banner and the Settings section. The
 * Rust scheduler owns timing and delivery; this store only mirrors status and
 * routes events to the UI.
 */
export class RemindersStore {
  settings: ReminderSettings | null = null;
  permission: NotificationPermission = "prompt";
  todayCount = 0;
  openCount = 0;
  missed: MissedDigest | null = null;
  /** In-app fallback for a toast the OS refused to show. */
  fallback: InAppReminder | null = null;
  loading = false;
  saving = false;
  testing = false;
  error: string | null = null;
  testResult: "ok" | "denied" | null = null;

  private readonly deps: RemindersDeps;
  private started = false;
  private loaded = false;
  private persisted: ReminderSettings | null = null;
  private pendingPatch: Partial<ReminderSettings> | null = null;
  private unlisten: Array<() => void> = [];

  constructor(deps: RemindersDeps = defaultReminderDeps) {
    this.deps = deps;
    makeAutoObservable<RemindersStore, "deps">(
      this,
      { deps: false },
      { autoBind: true },
    );
  }

  get enabled(): boolean {
    return this.settings?.remindersEnabled ?? false;
  }

  /** Subscribes to scheduler events and loads the current status once. */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;
    const subscriptions: Array<Promise<() => void>> = [
      this.deps.listen("ideas-focus", (payload) => this.applyFocus(payload)),
      this.deps.listen("ideas-missed", (payload) => this.applyMissed(payload)),
      this.deps.listen("ideas-reminder", (payload) => this.applyFallback(payload)),
    ];
    const results = await Promise.allSettled(subscriptions);
    for (const result of results) {
      if (result.status === "fulfilled") {
        this.unlisten.push(result.value);
      }
    }
    await this.load();
  }

  async load(force = false): Promise<void> {
    if ((this.loading || this.loaded) && !force) {
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      const status = await this.deps.api.status();
      runInAction(() => {
        this.applyStatus(status);
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

  /** Optimistic save with rollback to the last value the Rust side confirmed. */
  async save(patch: Partial<ReminderSettings>): Promise<void> {
    if (!this.settings) {
      return;
    }
    this.settings = { ...this.settings, ...patch };
    this.error = null;
    if (this.saving) {
      this.pendingPatch = { ...(this.pendingPatch ?? {}), ...patch };
      return;
    }
    this.saving = true;
    try {
      const status = await this.deps.api.save(this.settings);
      runInAction(() => {
        this.applyStatus(status);
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        if (this.persisted) {
          this.settings = { ...this.persisted };
        }
      });
    } finally {
      runInAction(() => {
        this.saving = false;
      });
      const queued = this.pendingPatch;
      this.pendingPatch = null;
      if (queued) {
        void this.save(queued);
      }
    }
  }

  async testNotification(): Promise<void> {
    if (this.testing) {
      return;
    }
    this.testing = true;
    this.testResult = null;
    this.error = null;
    try {
      const result = await this.deps.api.testNotification();
      runInAction(() => {
        this.testResult = result.delivered ? "ok" : "denied";
        this.permission = normalizePermission(result.permission);
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.testing = false;
      });
    }
  }

  applyFocus(payload: unknown): void {
    this.focus(readFocusEvent(payload).ideaId);
  }

  /** Opens the Ideas drawer for the id, or the list when absent. */
  focus(ideaId: string | null): void {
    this.deps.navigate(ideaId ? `#/ideas?focus=${ideaId}` : "#/ideas");
  }

  openIdeas(): void {
    this.focus(null);
  }

  applyMissed(payload: unknown): void {
    const event = readMissedEvent(payload);
    if (event) {
      this.missed = event;
    }
  }

  applyFallback(payload: unknown): void {
    const reminder = readInAppReminder(payload);
    if (reminder) {
      this.fallback = reminder;
    }
  }

  dismissMissed(): void {
    this.missed = null;
    void this.deps.api.dismissDigest().catch(() => undefined);
  }

  dismissFallback(): void {
    this.fallback = null;
  }

  dismissError(): void {
    this.error = null;
  }

  dispose(): void {
    for (const unlisten of this.unlisten) {
      try {
        unlisten();
      } catch {
        // Listener cleanup is best effort.
      }
    }
    this.unlisten = [];
    this.started = false;
  }

  private applyStatus(status: RemindersStatus): void {
    this.settings = status.settings;
    this.persisted = status.settings;
    this.permission = normalizePermission(status.permission);
    this.todayCount = status.todayCount;
    this.openCount = status.openCount;
    if (status.missed) {
      this.missed = status.missed;
    }
  }
}
