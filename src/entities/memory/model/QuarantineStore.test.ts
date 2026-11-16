import { describe, expect, it, vi } from "vitest";
import { memorySource } from "@/test/api";
import { quarantineItem, quarantinePage, quarantineReview } from "@/test/fixtures";
import { QuarantineStore } from "./QuarantineStore";

describe("QuarantineStore", () => {
  it("lists quarantined records and appends the next page", async () => {
    const first = quarantinePage([quarantineItem()], {
      hasMore: true,
      nextCursor: "q-2",
    });
    const second = quarantinePage([
      quarantineItem({ id: "note-q2", reason: "unknown_origin" }),
    ]);
    const listQuarantine = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const store = new QuarantineStore(memorySource({ listQuarantine }));

    await store.load("lv24");
    expect(store.items).toHaveLength(1);
    expect(store.hasMore).toBe(true);

    await store.loadMore();
    expect(store.items.map((item) => item.id)).toEqual(["note-q1", "note-q2"]);
    expect(listQuarantine).toHaveBeenLastCalledWith("lv24", {
      limit: 25,
      cursor: "q-2",
    });
    expect(store.hasMore).toBe(false);
  });

  it("reviews one record with the chosen trust and refreshes the inbox", async () => {
    const listQuarantine = vi
      .fn()
      .mockResolvedValueOnce(quarantinePage([quarantineItem()]))
      .mockResolvedValueOnce(quarantinePage([]));
    const reviewQuarantine = vi.fn(async () => quarantineReview());
    const store = new QuarantineStore(
      memorySource({ listQuarantine, reviewQuarantine }),
    );
    await store.load("lv24");
    const done = await store.review("lv24", "note-q1", "verified");
    expect(done).toBe(true);
    expect(reviewQuarantine).toHaveBeenCalledWith(
      "lv24",
      "note-q1",
      "verified",
    );
    expect(store.items).toEqual([]);
    expect(store.lastReviewed?.id).toBe("note-q1");
    await vi.waitFor(() => expect(listQuarantine).toHaveBeenCalledTimes(2));
  });

  it("restores the row and reports a failed review", async () => {
    const store = new QuarantineStore(
      memorySource({
        listQuarantine: async () => quarantinePage([quarantineItem()]),
        reviewQuarantine: async () => Promise.reject(new Error("denied")),
      }),
    );
    await store.load("lv24");
    const done = await store.review("lv24", "note-q1", "stated");
    expect(done).toBe(false);
    expect(store.items).toHaveLength(1);
    expect(store.actionError).toBe("denied");
    expect(store.reviewingId).toBeNull();
  });
});
