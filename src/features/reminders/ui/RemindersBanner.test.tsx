import { describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test/render";
import { RemindersBanner } from "./RemindersBanner";
import { RemindersStore } from "../model/RemindersStore";
import type { RemindersApi } from "../model/types";

const api: RemindersApi = {
  status: vi.fn(),
  save: vi.fn(),
  dismissDigest: vi.fn(async () => undefined),
  testNotification: vi.fn(),
};

function makeStore(): RemindersStore {
  return new RemindersStore({
    api,
    listen: async () => () => undefined,
    navigate: () => undefined,
  });
}

describe("RemindersBanner", () => {
  it("renders nothing without a digest or fallback", () => {
    const html = renderPage(<RemindersBanner store={makeStore()} />);
    expect(html).not.toContain("While you were away");
    expect(html).not.toContain("reminders-banners");
  });

  it("renders the missed digest count and actions", () => {
    const store = makeStore();
    store.applyMissed({
      count: 2,
      items: [
        { id: "idea-a", title: "A" },
        { id: "idea-b", title: "B" },
      ],
    });

    const html = renderPage(<RemindersBanner store={store} />);

    expect(html).toContain("While you were away");
    expect(html).toContain("2 ideas became due.");
    expect(html).toContain("Open ideas");
    expect(html).toContain("Dismiss");
  });

  it("uses the singular wording for one missed idea", () => {
    const store = makeStore();
    store.applyMissed({ count: 1, items: [{ id: "idea-a", title: "A" }] });

    expect(renderPage(<RemindersBanner store={store} />)).toContain(
      "1 idea became due.",
    );
  });

  it("renders the in-app fallback with the idea title", () => {
    const store = makeStore();
    store.applyFallback({
      ideaId: "idea-a",
      title: "Fix the footer",
      trigger: "lead",
    });

    const html = renderPage(<RemindersBanner store={store} />, "ru");

    expect(html).toContain("Напоминание");
    expect(html).toContain("Fix the footer");
    expect(html).toContain("Открыть идею");
  });

  it("uses the localized digest in other languages", () => {
    const store = makeStore();
    store.applyMissed({ count: 3, items: [] });

    expect(renderPage(<RemindersBanner store={store} />, "zh")).toContain(
      "你不在的时候",
    );
  });
});
