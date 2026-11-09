import { makeAutoObservable, runInAction } from "mobx";
import {
  applyDocumentLocale,
  detectLocale,
  persistLocale,
  type Locale,
} from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { settingsApi } from "../api/settingsApi";
import type { UpdateInfo } from "./types";

export class SettingsStore {
  locale: Locale;
  update: UpdateInfo | null = null;
  checkingUpdate = false;
  installingUpdate = false;
  error: string | null = null;

  constructor() {
    this.locale = detectLocale();
    applyDocumentLocale(this.locale);
    makeAutoObservable(this, {}, { autoBind: true });
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
    try {
      const update = await settingsApi.checkUpdate();
      runInAction(() => {
        this.update = update;
      });
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.checkingUpdate = false;
      });
    }
  }

  async installUpdate(): Promise<void> {
    if (this.installingUpdate) {
      return;
    }
    this.installingUpdate = true;
    this.error = null;
    try {
      await settingsApi.installUpdate();
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
    } finally {
      runInAction(() => {
        this.installingUpdate = false;
      });
    }
  }

  dismissError(): void {
    this.error = null;
  }
}
