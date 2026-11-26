/** Lead values offered by the settings screen, in minutes before the due time. */
export const REMINDER_LEADS = [0, 10, 60, 180, 1440] as const;

export type NotificationPermission = "granted" | "denied" | "prompt";

/**
 * Reminder preferences as returned by the Rust scheduler. The persisted key
 * for `remindersEnabled` keeps the flat settings.json field name.
 */
export interface ReminderSettings {
  remindersEnabled: boolean;
  defaultLeadMinutes: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  hideTitles: boolean;
  notifySound: boolean;
}

export interface MissedItem {
  id: string;
  title: string;
}

export interface MissedDigest {
  count: number;
  items: MissedItem[];
}

export interface RemindersStatus {
  settings: ReminderSettings;
  permission: string;
  todayCount: number;
  missed: MissedDigest | null;
  deliveryError: string | null;
}

export interface TestNotificationResult {
  delivered: boolean;
  permission: string;
  error: string | null;
}

export interface FocusEvent {
  ideaId: string | null;
}

export interface InAppReminder {
  ideaId: string | null;
  title: string | null;
  trigger: string;
}

export interface RemindersApi {
  status(): Promise<RemindersStatus>;
  save(settings: ReminderSettings): Promise<RemindersStatus>;
  dismissDigest(): Promise<void>;
  testNotification(): Promise<TestNotificationResult>;
}

export type ReminderEventListener = (
  event: string,
  handler: (payload: unknown) => void,
) => Promise<() => void>;

export interface RemindersDeps {
  api: RemindersApi;
  listen: ReminderEventListener;
  navigate: (hash: string) => void;
}

/** Restricts ids before they travel through the hash route. */
export function isSafeIdeaId(value: string): boolean {
  return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function readFocusEvent(payload: unknown): FocusEvent {
  if (payload && typeof payload === "object" && "ideaId" in payload) {
    const value = (payload as { ideaId?: unknown }).ideaId;
    if (typeof value === "string" && isSafeIdeaId(value)) {
      return { ideaId: value };
    }
  }
  return { ideaId: null };
}

export function readMissedEvent(payload: unknown): MissedDigest | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload as { count?: unknown; items?: unknown };
  if (typeof raw.count !== "number" || raw.count <= 0) {
    return null;
  }
  const items: MissedItem[] = [];
  if (Array.isArray(raw.items)) {
    for (const entry of raw.items) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const item = entry as { id?: unknown; title?: unknown };
      if (typeof item.id === "string") {
        items.push({
          id: item.id,
          title: typeof item.title === "string" ? item.title : "",
        });
      }
    }
  }
  return { count: raw.count, items };
}

export function readInAppReminder(payload: unknown): InAppReminder | null {  if (!payload || typeof payload !== "object") {
    return null;
  }
  const raw = payload as { ideaId?: unknown; title?: unknown; trigger?: unknown };
  const ideaId =
    typeof raw.ideaId === "string" && isSafeIdeaId(raw.ideaId) ? raw.ideaId : null;
  return {
    ideaId,
    title: typeof raw.title === "string" ? raw.title : null,
    trigger: typeof raw.trigger === "string" ? raw.trigger : "due",
  };
}

export function normalizePermission(value: string): NotificationPermission {
  return value === "granted" || value === "denied" ? value : "prompt";
}
