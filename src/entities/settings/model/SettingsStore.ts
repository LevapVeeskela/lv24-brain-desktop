import { listen } from "@tauri-apps/api/event";
import { makeAutoObservable, runInAction } from "mobx";
import {
  applyDocumentLocale,
  detectLocale,
  persistLocale,
  type Locale,
} from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { settingsApi } from "../api/settingsApi";
import type {
  SettingsErrorKind,
  UpdateInfo,
  UpdateProgress,
  UpdateStage,
} from "./types";

export class SettingsStore {
  locale: Locale;
  update: UpdateInfo | null = null;
  updateProgress: UpdateProgress | null = null;
  checkingUpdate = false;
  installingUpdate = false;
  /** The update was installed and the process is about to restart. */
  restartPending = false;
  error: string | null = null;
  errorKind: SettingsErrorKind = null;

  private progressUnlisten: (() => void) | null = null;
  private progressGeneration = 0;

  constructor() {
    this.locale = detectLocale();
    applyDocumentLocale(this.locale);
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get updatePercent(): number | null {
    if (this.restartPending) {
      return 100;
    }
    const progress = this.updateProgress;
    if (!progress || progress.total == null || progress.total <= 0) {
      return null;
    }
    // Floor keeps 99.5% from rounding up to 100 before the restart stage.
    const percent = Math.floor((progress.downloaded / progress.total) * 100);
    return Math.min(100, Math.max(0, percent));
  }

  get updateStage(): UpdateStage {
    if (this.restartPending) {
      return "restarting";
    }
    if (!this.installingUpdate) {
      return "idle";
    }
    const progress = this.updateProgress;
    if (!progress) {
      return "preparing";
    }
    if (
      progress.total != null &&
      progress.total > 0 &&
      progress.downloaded >= progress.total
    ) {
      return "restarting";
    }
    return "downloading";
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    persistLocale(locale);
    applyDocumentLocale(locale);
  }

  async checkUpdate(): Promise<void> {
    if (this.checkingUpdate || this.installingUpdate) {
      return;
    }
    this.checkingUpdate = true;
    this.error = null;
    this.errorKind = null;
    this.update = null;
    try {
      const update = await settingsApi.checkUpdate();
      runInAction(() => {
        this.update = update;
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.errorKind = "check";
      });
    } finally {
      runInAction(() => {
        this.checkingUpdate = false;
      });
    }
  }

  async installUpdate(): Promise<void> {
    if (this.installingUpdate || this.restartPending) {
      return;
    }
    this.installingUpdate = true;
    this.error = null;
    this.errorKind = null;
    this.updateProgress = null;
    // Listening is best effort and must not delay the install command; the
    // generation guard below cleans up if the listener resolves too late.
    void this.subscribeProgress();
    try {
      await settingsApi.installUpdate();
      runInAction(() => {
        this.update = null;
        this.restartPending = true;
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.errorKind = "install";
      });
    } finally {
      runInAction(() => {
        this.installingUpdate = false;
        this.updateProgress = null;
      });
      this.unsubscribeProgress();
    }
  }

  dismissError(): void {
    this.error = null;
    this.errorKind = null;
  }

  dispose(): void {
    this.unsubscribeProgress();
  }

  private async subscribeProgress(): Promise<void> {
    if (this.progressUnlisten) {
      return;
    }
    const generation = ++this.progressGeneration;
    try {
      const unlisten = await listen<UpdateProgress>(
        "update-progress",
        (event) => {
          if (!this.installingUpdate) {
            return;
          }
          runInAction(() => {
            this.updateProgress = {
              downloaded: event.payload.downloaded,
              total: event.payload.total ?? null,
            };
          });
        },
      );
      // The install may have finished or been disposed while listen() was
      // pending; never leave an orphaned listener behind.
      if (generation !== this.progressGeneration || !this.installingUpdate) {
        try {
          unlisten();
        } catch {
          // Listener cleanup is best effort.
        }
        return;
      }
      this.progressUnlisten = unlisten;
    } catch {
      // Progress is best effort: the install command can still succeed.
    }
  }

  private unsubscribeProgress(): void {
    this.progressGeneration += 1;
    const unlisten = this.progressUnlisten;
    this.progressUnlisten = null;
    try {
      unlisten?.();
    } catch {
      // Listener cleanup is best effort.
    }
  }
}
