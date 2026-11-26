import { describe, expect, it, vi } from "vitest";
import type { IdeaCreateInput } from "@/entities/ideas/model/types";
import { createFakeIdeasSource } from "@/pages/ideas/api/fakeIdeas";
import { IdeasStore } from "@/pages/ideas/model/IdeasStore";
import {
  bindRemindersDefaultLead,
  type DefaultLeadConsumer,
  type DefaultLeadSource,
} from "./remindersLead";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function leadSink(): DefaultLeadConsumer & {
  read: () => number | null | undefined;
} {
  let source: (() => number | null | undefined) | null = null;
  return {
    setDefaultLeadMinutes: vi.fn((next) => {
      source = next;
    }),
    read: () => (source ? source() : null),
  };
}

describe("bindRemindersDefaultLead", () => {
  it("follows the live reminder setting, including before it loads", () => {
    const reminders: { settings: { defaultLeadMinutes: number } | null } = {
      settings: null,
    };
    const ideas = leadSink();
    bindRemindersDefaultLead(ideas, reminders);

    expect(ideas.read()).toBeNull();
    reminders.settings = { defaultLeadMinutes: 60 };
    expect(ideas.read()).toBe(60);
    reminders.settings = { defaultLeadMinutes: 1440 };
    expect(ideas.read()).toBe(1440);
    reminders.settings = null;
    expect(ideas.read()).toBeNull();
  });

  it("clears the hook on teardown", () => {
    const ideas = leadSink();
    const release = bindRemindersDefaultLead(ideas, {
      settings: { defaultLeadMinutes: 10 },
    });
    expect(ideas.read()).toBe(10);

    release();
    expect(ideas.read()).toBeNull();
  });

  it("writes the settings lead on quick add once settings arrive", async () => {
    const source = createFakeIdeasSource({ now: () => now, ideas: [] });
    const store = new IdeasStore(source, { now: () => now });
    await store.load();
    const reminders: DefaultLeadSource & {
      settings: { defaultLeadMinutes: number } | null;
    } = { settings: null };
    bindRemindersDefaultLead(store, reminders);

    const create = source.create.bind(source);
    let created: IdeaCreateInput | undefined;
    source.create = async (input) => {
      created = input;
      return create(input);
    };

    await store.quickAdd("Before settings");
    expect(created?.remindBeforeMinutes).toBeUndefined();

    reminders.settings = { defaultLeadMinutes: 60 };
    await store.quickAdd("After settings");
    expect(created?.remindBeforeMinutes).toBe(60);
  });
});
