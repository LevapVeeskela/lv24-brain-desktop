import { describe, expect, it, vi } from "vitest";
import { deferred, memorySource } from "@/test/api";
import {
  catchupReport,
  memoryRecord,
  recordDetail,
  recordPage,
} from "@/test/fixtures";
import { MemoryStore } from "./MemoryStore";

describe("MemoryStore", () => {
  it("loads a page through loading, empty and loaded states", async () => {
    const pending = deferred<ReturnType<typeof recordPage>>();
    const listRecords = vi.fn(() => pending.promise);
    const store = new MemoryStore(memorySource({ listRecords }));
    const load = store.load("lv24");
    expect(store.loading).toBe(true);
    expect(store.loaded).toBe(false);
    pending.resolve(recordPage([]));
    await load;
    expect(store.loading).toBe(false);
    expect(store.loaded).toBe(true);
    expect(store.items).toEqual([]);
    expect(store.isEmpty).toBe(true);
  });

  it("surfaces API errors and keeps the previous load state", async () => {
    const store = new MemoryStore(
      memorySource({ listRecords: async () => Promise.reject(new Error("denied")) }),
    );
    await store.load("lv24");
    expect(store.error).toBe("denied");
    expect(store.loading).toBe(false);
    expect(store.loaded).toBe(false);
  });

  it("appends pages and resets the cursor when filters change", async () => {
    const first = recordPage([memoryRecord({ id: "dec-1" })], {
      hasMore: true,
      nextCursor: "cursor-1",
    });
    const second = recordPage([memoryRecord({ id: "note-2", kind: "note" })]);
    const listRecords = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(first);
    const store = new MemoryStore(memorySource({ listRecords }));

    await store.load("lv24");
    expect(store.items).toHaveLength(1);
    expect(store.hasMore).toBe(true);

    await store.loadMore();
    expect(store.items).toHaveLength(2);
    expect(store.hasMore).toBe(false);
    expect(listRecords).toHaveBeenLastCalledWith(
      "lv24",
      expect.objectContaining({ cursor: "cursor-1" }),
    );

    store.applyFilters({ kinds: ["decision"] });
    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
    await store.load("lv24");
    expect(listRecords).toHaveBeenLastCalledWith(
      "lv24",
      expect.objectContaining({ kinds: ["decision"] }),
    );
  });

  it("clears project data immediately when the selection changes", async () => {
    const store = new MemoryStore(
      memorySource({
        listRecords: async () =>
          recordPage([memoryRecord({ id: "a-1", projectId: "alpha" })]),
      }),
    );
    await store.load("alpha");
    store.detail = recordDetail({ id: "a-1" });
    store.recentProjectId = "alpha";
    store.recentItems = [memoryRecord()];
    store.setProject("beta");
    expect(store.projectId).toBe("beta");
    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
    expect(store.detail).toBeNull();
    expect(store.recentItems).toEqual([]);
    store.setProject("beta");
    expect(store.projectId).toBe("beta");
  });

  it("reloads when filters change during an in-flight load", async () => {
    const slow = deferred<ReturnType<typeof recordPage>>();
    const listRecords = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(recordPage([memoryRecord({ id: "dec-2" })]));
    const store = new MemoryStore(memorySource({ listRecords }));
    const first = store.load("lv24");
    store.applyFilters({ kinds: ["decision"] });
    const second = store.load("lv24");
    await second;
    expect(store.items.map((item) => item.id)).toEqual(["dec-2"]);
    expect(listRecords).toHaveBeenCalledTimes(2);
    slow.resolve(recordPage([memoryRecord({ id: "old" })]));
    await first;
    expect(store.items.map((item) => item.id)).toEqual(["dec-2"]);
  });

  it("ignores a stale response after the project changes", async () => {
    const slow = deferred<ReturnType<typeof recordPage>>();
    const fast = deferred<ReturnType<typeof recordPage>>();
    const listRecords = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const store = new MemoryStore(memorySource({ listRecords }));

    const firstLoad = store.load("alpha");
    const secondLoad = store.load("beta");
    fast.resolve(recordPage([memoryRecord({ id: "beta-1", projectId: "beta" })]));
    await secondLoad;
    slow.resolve(recordPage([memoryRecord({ id: "alpha-1", projectId: "alpha" })]));
    await firstLoad;

    expect(store.projectId).toBe("beta");
    expect(store.items.map((item) => item.id)).toEqual(["beta-1"]);
    expect(store.loading).toBe(false);
  });

  it("caches record details until a forced reload", async () => {
    const getRecord = vi.fn(async () => recordDetail({ id: "dec-1" }));
    const store = new MemoryStore(memorySource({ getRecord }));
    await store.loadDetail("lv24", "dec-1");
    expect(store.detail?.id).toBe("dec-1");
    await store.loadDetail("lv24", "dec-1");
    expect(getRecord).toHaveBeenCalledTimes(1);
    await store.loadDetail("lv24", "dec-1", { force: true });
    expect(getRecord).toHaveBeenCalledTimes(2);
    store.clearDetail();
    expect(store.detail).toBeNull();
  });

  it("loads the project summary and catchup report", async () => {
    const handoff = memoryRecord({ id: "handoff-1", kind: "handoff" });
    const listRecords = vi.fn(async (_project: string, query?: { kinds?: string[] }) =>
      query?.kinds?.includes("handoff")
        ? recordPage([handoff])
        : recordPage([memoryRecord({ id: "note-1" })]),
    );
    const catchup = vi.fn(async () => catchupReport([memoryRecord()]));
    const store = new MemoryStore(memorySource({ listRecords, catchup }));

    await store.loadProjectSummary("lv24");
    expect(store.latestHandoff?.id).toBe("handoff-1");
    expect(store.recentItems).toHaveLength(1);

    await store.loadCatchup("lv24");
    expect(store.catchup?.project.id).toBe("lv24");
    expect(catchup).toHaveBeenCalledWith("lv24", { limit: 50 });
  });
});
