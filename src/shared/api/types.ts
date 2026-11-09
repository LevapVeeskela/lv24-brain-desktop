export type EnginePhase = "starting" | "running" | "paused" | "error" | "stopped";

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
  autostart: AutostartStatus;
  desktopVersion: string;
  deepLinkScheme: string;
  logDir: string;
}

export interface SyncFailure {
  connectionId: string;
  error: string;
}

export interface SyncSummary {
  total: number;
  queued: number;
  failures: SyncFailure[];
}

export interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
}

export interface UpdateInfo {
  available: boolean;
  version?: string;
  notes?: string;
  date?: string;
}

export interface RunLogEvent {
  streamId: string;
  event: string;
  data: string;
}
