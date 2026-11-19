import { describe, expect, it } from "vitest";
import { JournalStore } from "./JournalStore";

describe("JournalStore", () => {
  it("loads every project when the project is null", async () => {
    const calls: Array<[string | null, number]> = [];
    const store = new JournalStore({
      read: async (projectId, limit) => {
        calls.push([projectId, limit]);
        return { items: [], limit, hasMore: false };
      },
    });
    await store.load(null);
    expect(calls).toEqual([[null, 50]]);
    expect(store.loaded).toBe(true);
  });

  it("does not reload an already loaded all-project page without force", async () => {
    let reads = 0;
    const store = new JournalStore({
      read: async (_projectId, limit) => {
        reads += 1;
        return { items: [], limit, hasMore: false };
      },
    });
    await store.load(null);
    await store.load(null);
    expect(reads).toBe(1);
    await store.load(null, { force: true });
    expect(reads).toBe(2);
  });
});
