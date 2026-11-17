import { tauriInvoke } from "@/shared/api/tauri";
import type { UpdateInfo } from "../model/types";

export const settingsApi = {
  checkUpdate: () => tauriInvoke<UpdateInfo>("update_check"),
  installUpdate: () => tauriInvoke<void>("update_install"),
  secretNames: () => tauriInvoke<string[]>("engine_secrets"),
};
