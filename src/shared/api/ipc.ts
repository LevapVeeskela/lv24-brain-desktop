/**
 * Tauri's custom-protocol IPC can fail on a WebView2 startup race with
 * `missing Origin header`: the webview sends the invoke request without the
 * header Tauri requires, Tauri answers HTTP 500, and the JS invoke rejects
 * before any command reaches Rust. The agent and data are healthy; the page
 * needs one reload to re-establish the IPC channel.
 *
 * Keep the recovery to one automatic reload per webview session. If the second
 * attempt still fails, the UI keeps the actionable error and the user can
 * reload explicitly.
 */
const IPC_RELOAD_KEY = "lv24.ipc-origin-reload";

export function isMissingOriginError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /missing Origin header/i.test(message);
}

export interface IpcRecoveryEnvironment {
  storage?: Pick<Storage, "getItem" | "setItem">;
  reload?: () => void;
}

function defaultEnvironment(): IpcRecoveryEnvironment {
  if (typeof window === "undefined") {
    return {};
  }
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    // A locked-down webview can deny storage; recovery then stays disabled.
  }
  return {
    storage,
    reload: () => window.location.reload(),
  };
}

/** Reload once for a Tauri missing-Origin IPC failure. Returns true if it did. */
export function recoverMissingOriginIpc(
  error: unknown,
  environment: IpcRecoveryEnvironment = defaultEnvironment(),
): boolean {
  if (!isMissingOriginError(error)) {
    return false;
  }
  const { storage, reload } = environment;
  if (!storage || !reload) {
    return false;
  }
  try {
    if (storage.getItem(IPC_RELOAD_KEY) === "1") {
      return false;
    }
    storage.setItem(IPC_RELOAD_KEY, "1");
  } catch {
    return false;
  }
  reload();
  return true;
}
