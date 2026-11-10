import { describe, expect, it } from "vitest";
import type { Run } from "@/entities/connection/model/types";
import { isRunFailure, runDisplayStatus, runHealthStatus } from "./presentation";

function sample(status: Run["status"], truncated?: string): Run {
  return {
    id: "work-1", source: "github", status, startedAt: "2026-11-10T00:00:00Z",
    stats: { seen: 25, upserted: 25, unchanged: 0, deleted: 0, skipped: 0, batches: 1, truncated },
  };
}

describe("run presentation", () => {
  it("shows cancellation only with an explicit completed-run reason", () => {
    const canceled = sample("partial", "canceled");
    expect(runDisplayStatus(canceled)).toBe("canceled");
    expect(canceled.status).toBe("partial");
    expect(isRunFailure(canceled)).toBe(false);
    expect(runDisplayStatus(sample("failed", "canceled"))).toBe("canceled");
    expect(runDisplayStatus(sample("running", "canceled"))).toBe("running");
  });

  it("does not infer cancellation or completion from equal item counts", () => {
    for (const reason of [undefined, "deadline", "limit", "rate-limit", "size-cap"]) {
      const partial = sample("partial", reason);
      expect(runDisplayStatus(partial)).toBe("partial");
      expect(isRunFailure(partial)).toBe(true);
    }
    expect(runDisplayStatus(sample("success"))).toBe("success");
    expect(isRunFailure(sample("success"))).toBe(false);
    expect(runHealthStatus(undefined)).toBe("unknown");
  });
});
