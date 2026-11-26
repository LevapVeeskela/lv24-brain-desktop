import { tauriInvoke } from "@/shared/api/tauri";
import type {
  RemindersApi,
  RemindersStatus,
  ReminderSettings,
  TestNotificationResult,
} from "../model/types";

export const remindersApi: RemindersApi = {
  status: () => tauriInvoke<RemindersStatus>("reminders_settings_get"),
  save: (settings: ReminderSettings) =>
    tauriInvoke<RemindersStatus>("reminders_settings_set", { settings }),
  dismissDigest: () => tauriInvoke<void>("reminders_dismiss_digest"),
  testNotification: () =>
    tauriInvoke<TestNotificationResult>("ideas_test_notification"),
};
