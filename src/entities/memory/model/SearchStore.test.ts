import { describe, expect, it, vi } from "vitest";
import { memorySource } from "@/test/api";
import { searchPage } from "@/test/fixtures";
import { SearchStore, type SearchScheduler } from "./SearchStore";

const hit = {
  id: "dec-1",
  projectId: "lv24",
  kind: "decision",
  title: "Use SQLite FTS5",
  preview: "…",
  score: 0.8,
  matchReasons: [],
};

function immediateScheduler(): SearchScheduler {
  return {
    set: (callback) => {
      callback();
      return 0;
    },
    clear: () => undefined,
  };
}

describe("SearchStore", () => {
  it("debounces queries, keeps short input empty and reports errors", async () => {
    let pending: (() => void) | null = null;
    const scheduler: SearchScheduler = {
      set: (callback) => {
        pending = callback;
        return 1;
      },
      clear: () => {
        pending = null;
      },
    };
    const search = vi.fn(async () => searchPage([hit]));
    const store = new SearchStore(memorySource({ search }), {
      scheduler,
      debounceMs: 150,
    });
    store.setProject("lv24");
    store.setQuery("sq");
    expect(search).not.toHaveBeenCalled();
    expect(pending).not.toBeNull();
    (pending as unknown as () => void)();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(store.hits).toHaveLength(1);
    expect(store.appliedQuery).toBe("sqlite");

    store.setQuery("s");
    expect(store.tooShort).toBe(true);
    expect(store.searched).toBe(false);
    expect(store.hits).toEqual([]);
  });

  it("records empty and error states for the page", async () => {
    const empty = new SearchStore(
      memorySource({ search: async () => searchPage([]) }),
      { scheduler: immediateScheduler() },
    );
    empty.setProject("lv24");
    empty.setQuery("nothing");
    await vi.waitFor(() => expect(empty.searched).toBe(true));
    expect(empty.isEmpty).toBe(true);

    const failing = new SearchStore(
      memorySource({ search: async () => Promise.reject(new Error("index down")) }),
      { scheduler: immediateScheduler() },
    );
    failing.setProject("lv24");
    failing.setQuery("broken");
    await vi.waitFor(() => expect(failing.error).toBe("index down"));
    expect(failing.searched).toBe(true);
  });

  it("paginates with the cursor and forwards filters and explain", async () => {
    const first = searchPage([hit], { hasMore: true, nextCursor: "cursor-1" });
    const second = searchPage([{ ...hit, id: "note-2" }], { page: 2 });
    const search = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const store = new SearchStore(memorySource({ search }), {
      scheduler: immediateScheduler(),
    });
    store.setProject("lv24");
    store.setQuery("sqlite");
    await vi.waitFor(() => expect(store.hits).toHaveLength(1));
    await store.loadMore();
    expect(store.hits).toHaveLength(2);
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "cursor-1" }),
    );

    store.setFilters({ explain: true, minScore: 0.3 });
    await vi.waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cursor: undefined,
          filters: expect.objectContaining({ explain: true, minScore: 0.3 }),
        }),
      ),
    );
  });

  it("ignores a stale result after a project change", async () => {
    let resolveSlow!: (value: ReturnType<typeof searchPage>) => void;
    const slow = new Promise<ReturnType<typeof searchPage>>((resolve) => {
      resolveSlow = resolve;
    });
    const search = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(searchPage([{ ...hit, projectId: "beta", id: "beta-1" }]));
    const store = new SearchStore(memorySource({ search }), {
      scheduler: immediateScheduler(),
    });
    store.setProject("alpha");
    store.setQuery("sqlite");
    store.setProject("beta");
    await vi.waitFor(() =>
      expect(store.hits.map((item) => item.id)).toEqual(["beta-1"]),
    );
    resolveSlow(searchPage([{ ...hit, projectId: "alpha", id: "alpha-1" }]));
    await Promise.resolve();
    expect(store.hits.map((item) => item.id)).toEqual(["beta-1"]);
  });
});
