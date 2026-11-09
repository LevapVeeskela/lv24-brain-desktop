import { invoke } from "@tauri-apps/api/core";
import type { UpdateInfo } from "../model/types";

export const settingsApi = {
  checkUpdate: () => invoke<UpdateInfo>("update_check"),
  installUpdate: () => invoke<void>("update_install"),
};
