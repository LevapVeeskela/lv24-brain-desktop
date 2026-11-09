import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface AuthLine {
  connectionId: string;
  stream: "stdout" | "stderr" | string;
  line: string;
}

export interface AuthOutcome {
  exitCode?: number;
  output: string;
}

export const connectionAuthApi = {
  start: (connectionId: string, clientId?: string) =>
    invoke<AuthOutcome>("engine_connection_auth", {
      connectionId,
      clientId: clientId?.trim() || null,
    }),
  onLine: (listener: (line: AuthLine) => void): Promise<UnlistenFn> =>
    listen<AuthLine>("connection-auth", (event) => listener(event.payload)),
};
