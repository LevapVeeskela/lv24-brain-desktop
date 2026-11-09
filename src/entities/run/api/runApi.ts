import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface RunLogEvent {
  streamId: string;
  event: string;
  data: string;
}

export interface RunLogEnd {
  streamId: string;
  error?: string;
}

export const runApi = {
  openLog: (runId: string) =>
    invoke<string>("run_log_open", { runId }),
  closeLog: (streamId: string) =>
    invoke<void>("run_log_close", { streamId }),
  onLog: (listener: (event: RunLogEvent) => void): Promise<UnlistenFn> =>
    listen<RunLogEvent>("run-log", (event) => listener(event.payload)),
  onEnd: (listener: (event: RunLogEnd) => void): Promise<UnlistenFn> =>
    listen<RunLogEnd>("run-log-end", (event) => listener(event.payload)),
};
