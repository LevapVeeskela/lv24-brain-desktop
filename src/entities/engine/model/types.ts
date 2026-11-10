export type EnginePhase =
  | "starting"
  | "running"
  | "paused"
  | "error"
  | "stopped";

/**
 * UI-facing phase. The shell has no status yet while the first `shell_status`
 * call is in flight, and that call can fail before any status is known.
 */
export type EngineViewPhase =
  | EnginePhase
  | "initializing"
  | "unavailable";

export interface EngineStatus {
  phase: EnginePhase;
  running: boolean;
  owned: boolean;
  pid?: number;
  port?: number;
  version?: string;
  startedAt?: string;
  lastError?: string;
  dataDir?: string;
  configPath?: string;
  engineBin?: string;
  engineSource?: string;
  updateChannel?: string;
  restarts: number;
}

export interface AutostartStatus {
  enabled: boolean;
  supported: boolean;
  detail?: string;
}

export interface ShellStatus {
  engine: EngineStatus;
  paused: boolean;
  updating: boolean;
  autostart: AutostartStatus;
  desktopVersion: string;
  deepLinkScheme: string;
  logDir: string;
}

export type EngineAction =
  | "start"
  | "pause"
  | "autostart"
  | "quit"
  | null;
