import { invoke } from "@tauri-apps/api/core";
import type { InvokeFn } from "./types";
import { recoverMissingOriginIpc } from "./ipc";

/**
 * Wrap a Tauri invoke so a missing-Origin IPC failure reloads the webview
 * instead of surfacing a fake "engine unavailable" state. The reloading page
 * owns the promise; callers must not render an error while it is being torn
 * down.
 */
export function withIpcRecovery(invokeFn: InvokeFn): InvokeFn {
  return ((command: string, args?: Record<string, unknown>) =>
    invokeFn(command, args).catch((cause: unknown) => {
      if (recoverMissingOriginIpc(cause)) {
        return new Promise(() => undefined);
      }
      throw cause;
    })) as InvokeFn;
}

/** The app's Tauri invoke with one-shot missing-Origin recovery. */
export const tauriInvoke: InvokeFn = withIpcRecovery(invoke);
