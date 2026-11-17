import { tauriInvoke } from "@/shared/api/tauri";
import type { ShellStatus } from "../model/types";

/** Commands implemented by the Rust shell supervisor. */
export const engineApi = {
  status: () => tauriInvoke<ShellStatus>("shell_status"),
  start: () => tauriInvoke<ShellStatus>("engine_start"),
  pause: () => tauriInvoke<ShellStatus>("engine_pause"),
  setAutostart: (enabled: boolean) =>
    tauriInvoke<ShellStatus>("autostart_set", { enabled }),
  quit: () => tauriInvoke<void>("app_quit"),
  takeDeepLink: () => tauriInvoke<string | null>("deep_link_take"),
};
