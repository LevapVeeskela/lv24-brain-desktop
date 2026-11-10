export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  date?: string;
}

/** Payload of the `update-progress` event emitted by the Rust updater. */
export interface UpdateProgress {
  downloaded: number;
  total?: number | null;
}

export type UpdateStage =
  | "idle"
  | "preparing"
  | "downloading"
  | "restarting";

export type SettingsErrorKind = "check" | "install" | null;
