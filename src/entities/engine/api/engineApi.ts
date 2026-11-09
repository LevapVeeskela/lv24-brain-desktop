import { invoke } from "@tauri-apps/api/core";
import type { ShellStatus } from "../model/types";

/** Commands implemented by the Rust shell supervisor. */
export const engineApi = {
  status: () => invoke<ShellStatus>("shell_status"),
  start: () => invoke<ShellStatus>("engine_start"),
  pause: () => invoke<ShellStatus>("engine_pause"),
  setAutostart: (enabled: boolean) =>
    invoke<ShellStatus>("autostart_set", { enabled }),
  quit: () => invoke<void>("app_quit"),
  takeDeepLink: () => invoke<string | null>("deep_link_take"),
};
