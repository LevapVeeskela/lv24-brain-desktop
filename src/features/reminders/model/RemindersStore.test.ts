import { describe, expect, it, vi } from "vitest";
import { RemindersStore } from "./RemindersStore";
import type {
  RemindersApi,
  RemindersDeps,
  RemindersStatus,
  ReminderSettings,
} from "./types";

const settings: ReminderSettings = {
  remindersEnabled: true,
  defaultLeadMinutes: 10,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  hideTitles: false,
  notifySound: true,
};

const status: RemindersStatus = {
  settings,
  permission: "granted",
  todayCount: 2,
  openCount: 5,
  missed: null,
};

function harness(overrides: Partial<RemindersApi> = {}) {
  const events = new Map<string, (payload: unknown) => void>();
  const navigations: string[] = [];
  const api: RemindersApi = {
    status: vi.fn(async () => status),
    save: vi.fn(async (next: ReminderSettings) => ({
      ...status,
      settings: next,
    })),
    dismissDigest: vi.fn(async () => undefined),
    testNotification: vi.fn(async () => ({
      delivered: true,
      permission: "granted",
      error: null,
    })),
    ...overrides,
  };
  const deps: RemindersDeps = {
    api,
    listen: async (event, handler) => {
      events.set(event, handler);
      return () => events.delete(event);
    },
    navigate: (hash) => navigations.push(hash),
  };
  return {
    api,
    events,
    navigations,
    store: new RemindersStore(deps),
  };
}

describe("RemindersStore", () => {
  it("loads status, then routes focus and missed events", async () => {
    const { events, navigations, store } = harness();
    await store.start();

    expect(store.settings?.remindersEnabled).toBe(true);
    expect(store.permission).toBe("granted");
    expect(store.todayCount).toBe(2);
    expect(store.openCount).toBe(5);

    events.get("ideas-focus")?.({ ideaId: "idea-01J8ZQ4T7X" });
    expect(navigations.at(-1)).toBe("#/ideas?focus=idea-01J8ZQ4T7X");

    events.get("ideas-focus")?.({ ideaId: "bad id" });
    expect(navigations.at(-1)).toBe("#/ideas");

    events.get("ideas-missed")?.({
      count: 2,
      items: [
        { id: "idea-a", title: "A" },
        { id: "idea-b", title: "B" },
      ],
    });
    expect(store.missed?.count).toBe(2);
    store.dismissMissed();
    expect(store.missed).toBeNull();
  });

  it("keeps the in-app fallback until dismissed", async () => {
    const { events, store } = harness();
    await store.start();

    events.get("ideas-reminder")?.({
      ideaId: "idea-a",
      title: "Fix the footer",
      trigger: "due",
    });
    expect(store.fallback?.title).toBe("Fix the footer");
    store.dismissFallback();
    expect(store.fallback).toBeNull();
  });

  it("saves optimistically and rolls back on failure", async () => {
    const save = vi.fn(async () => {
      throw new Error("cannot write settings");
    });
    const { store } = harness({ save });
    await store.start();

    await store.save({ hideTitles: true });

    expect(save).toHaveBeenCalled();
    expect(store.settings?.hideTitles).toBe(false);
    expect(store.error).toContain("cannot write settings");
  });

  it("persists a successful change", async () => {
    const { store } = harness();
    await store.start();

    await store.save({ defaultLeadMinutes: 60 });

    expect(store.settings?.defaultLeadMinutes).toBe(60);
    expect(store.error).toBeNull();
  });

  it("reports a blocked test notification as denied", async () => {
    const { store } = harness({
      testNotification: vi.fn(async () => ({
        delivered: false,
        permission: "denied",
        error: "notifications are blocked",
      })),
    });
    await store.start();

    await store.testNotification();

    expect(store.testResult).toBe("denied");
    expect(store.permission).toBe("denied");
  });
});
