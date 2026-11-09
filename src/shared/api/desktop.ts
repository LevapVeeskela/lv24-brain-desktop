import { invoke } from "@tauri-apps/api/core";
import type {
  ApiResponse,
  RunLogEvent,
  ShellStatus,
  SyncSummary,
  UpdateInfo,
} from "./types";

// The webview only talks to these Tauri commands. The bearer token and the
// agent port stay inside the Rust process; see src-tauri/src/api.rs.
export const desktop = {
  status: () => invoke<ShellStatus>("shell_status"),
  startEngine: () => invoke<ShellStatus>("engine_start"),
  pauseEngine: () => invoke<ShellStatus>("engine_pause"),
  syncAll: () => invoke<SyncSummary>("engine_sync_all"),
  setAutostart: (enabled: boolean) =>
    invoke<ShellStatus>("autostart_set", { enabled }),
  checkUpdate: () => invoke<UpdateInfo>("update_check"),
  installUpdate: () => invoke<void>("update_install"),
  quit: () => invoke<void>("app_quit"),
  api: (method: string, path: string, body?: unknown) =>
    invoke<ApiResponse>("api_request", {
      method,
      path,
      body: body === undefined ? null : JSON.stringify(body),
    }),
  openRunLog: (runId: string) =>
    invoke<string>("run_log_open", { runId }),
  closeRunLog: (streamId: string) =>
    invoke<void>("run_log_close", { streamId }),
  takeDeepLink: () => invoke<string | null>("deep_link_take"),
};

export type { ApiResponse, RunLogEvent, ShellStatus, SyncSummary, UpdateInfo };
