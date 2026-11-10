import { describe, expect, it, vi } from "vitest";
import type { Run } from "@/entities/connection/model/types";
import {
  RUN_LIST_LIMIT,
  RunsStore,
  type RunLogApi,
  type RunsSource,
} from "./RunsStore";
import type { RunLogEnd, RunLogEvent } from "../api/runApi";

const run: Run = {
  id: "github-main-1",
  source: "github",
  connectionId: "github-main",
  status: "success",
  startedAt: "2026-11-10T00:00:00Z",
};

function fakeLogApi() {
  const listeners: {
    log?: (event: RunLogEvent) => void;
    end?: (event: RunLogEnd) => void;
  } = {};
  const api: RunLogApi = {
    openLog: vi.fn(async () => "stream-1"),
    closeLog: vi.fn(async () => undefined),
    onLog: async (listener) => {
      listeners.log = listener;
      return () => undefined;
    },
    onEnd: async (listener) => {
      listeners.end = listener;
      return () => undefined;
    },
  };
  return { api, listeners };
}

describe("RunsStore", () => {
  it("filters runs by connection and streams log lines", async () => {
    const source: RunsSource = {
      listRuns: vi.fn(async () => [run]),
    };
    const { api, listeners } = fakeLogApi();
    const store = new RunsStore(source, api);
    store.start();
    await vi.waitFor(() => expect(listeners.log).toBeDefined());
    await store.load();
    expect(source.listRuns).toHaveBeenCalledWith(RUN_LIST_LIMIT);
    expect(store.forConnection("github-main")).toEqual([run]);
    expect(store.forConnection("other")).toEqual([]);

    await store.openLog(run.id);
    listeners.log?.({
      streamId: "stream-1",
      event: "log",
      data: "hello",
    });
    expect(store.logs).toEqual([{ id: 0, event: "log", data: "hello" }]);
    listeners.end?.({ streamId: "stream-1" });
    expect(store.streaming).toBe(false);
    store.dispose();
  });

  it("buffers log lines that arrive while the stream id is pending", async () => {
    const source: RunsSource = { listRuns: vi.fn(async () => []) };
    const { api, listeners } = fakeLogApi();
    let resolveOpen: ((id: string) => void) | undefined;
    api.openLog = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOpen = resolve;
        }),
    );
    const store = new RunsStore(source, api);
    store.start();
    await vi.waitFor(() => expect(listeners.log).toBeDefined());

    const opening = store.openLog(run.id);
    await vi.waitFor(() => expect(api.openLog).toHaveBeenCalled());
    listeners.log?.({
      streamId: "early-stream",
      event: "log",
      data: "early",
    });
    resolveOpen?.("early-stream");
    await opening;
    expect(store.logs).toEqual([{ id: 0, event: "log", data: "early" }]);
    store.dispose();
  });

  it("keeps stable line ids when the oldest lines fall off the cap", async () => {
    const source: RunsSource = { listRuns: vi.fn(async () => []) };
    const { api, listeners } = fakeLogApi();
    const store = new RunsStore(source, api);
    store.start();
    await vi.waitFor(() => expect(listeners.log).toBeDefined());
    await store.openLog(run.id);

    for (let index = 0; index < 1002; index += 1) {
      listeners.log?.({
        streamId: "stream-1",
        event: "log",
        data: `line ${index}`,
      });
    }

    expect(store.logs).toHaveLength(1000);
    expect(store.logs[0]).toEqual({
      id: 2,
      event: "log",
      data: "line 2",
    });
    expect(store.logs[999]).toEqual({
      id: 1001,
      event: "log",
      data: "line 1001",
    });
    store.dispose();
  });
});
