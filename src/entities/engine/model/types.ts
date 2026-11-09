export type EnginePhase =
  | "starting"
  | "running"
  | "paused"
  | "error"
  | "stopped";

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
