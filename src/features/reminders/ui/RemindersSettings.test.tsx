import { describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test/render";
import { RemindersSettings } from "./RemindersSettings";
import { RemindersStore } from "../model/RemindersStore";
import type { RemindersApi, RemindersStatus } from "../model/types";

const status: RemindersStatus = {
  settings: {
    remindersEnabled: true,
    defaultLeadMinutes: 60,
    quietHoursStart: "22:30",
    quietHoursEnd: "07:00",
    hideTitles: true,
    notifySound: false,
  },
  permission: "granted",
  todayCount: 1,
  openCount: 4,
  missed: null,
};

function makeStore(overrides: Partial<RemindersApi> = {}): RemindersStore {
  const api: RemindersApi = {
    status: vi.fn(async () => status),
    save: vi.fn(async (settings) => ({ ...status, settings })),
    dismissDigest: vi.fn(async () => undefined),
    testNotification: vi.fn(async () => ({
      delivered: true,
      permission: "granted",
      error: null,
    })),
    ...overrides,
  };
  return new RemindersStore({
    api,
    listen: async () => () => undefined,
    navigate: () => undefined,
  });
}

describe("RemindersSettings", () => {
  it("renders every control from the stored settings", async () => {
    const store = makeStore();
    await store.start();

    const html = renderPage(<RemindersSettings store={store} />);

    expect(html).toContain("Reminders");
    expect(html).toContain("Enable reminders");
    expect(html).toContain("1 hour before");
    expect(html).toContain("22:30");
    expect(html).toContain("07:00");
    expect(html).toContain("Hide titles in notifications");
    expect(html).toContain("Send a test notification");
    expect(html).toContain("Start at login");
    expect(html).toContain('type="checkbox" checked=""');
  });

  it("shows the blocked-permission notice", async () => {
    const store = makeStore({
      status: vi.fn(async () => ({ ...status, permission: "denied" })),
    });
    await store.start();

    const html = renderPage(<RemindersSettings store={store} />);

    expect(html).toContain("System notifications are blocked.");
  });

  it("shows a loading state before the status arrives", () => {
    const html = renderPage(<RemindersSettings store={makeStore()} />);

    expect(html).toContain("Loading reminders:");
  });

  it("renders the translated card", async () => {
    const store = makeStore();
    await store.start();

    const html = renderPage(<RemindersSettings store={store} />, "zh");

    expect(html).toContain("提醒");
    expect(html).toContain("默认提前量");
  });
});
