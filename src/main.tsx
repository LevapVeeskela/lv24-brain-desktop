import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { isMissingOriginError } from "@/shared/api/ipc";
import { App } from "./app/App";
import "./app/styles/global.css";

const IPC_PROBE_TIMEOUT_MS = 3000;

/**
 * Force Tauri's own IPC fallback. Its custom-protocol path normally falls back
 * to `window.ipc.postMessage` only when `fetch` rejects; a WebView2 race can
 * instead return HTTP 500 ("missing Origin header"), which leaves the custom
 * protocol selected. Rejecting the IPC URL here makes Tauri set
 * customProtocolIpcFailed and use the Origin-independent postMessage transport.
 */
function forcePostMessageIpc(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (raw.startsWith("http://ipc.localhost")) {
      return Promise.reject(
        new Error("custom-protocol IPC disabled after missing Origin header"),
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}

function withIpcTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("IPC probe timed out")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

/**
 * The readiness handshake runs before React. If the custom protocol is broken,
 * switch to postMessage and retry once; the native watchdog is the last resort.
 */
async function bootstrapIpc(): Promise<void> {
  try {
    await withIpcTimeout(invoke("ui_ready"), IPC_PROBE_TIMEOUT_MS);
    return;
  } catch (cause) {
    const timedOut =
      cause instanceof Error && cause.message === "IPC probe timed out";
    if (!isMissingOriginError(cause) && !timedOut) {
      return;
    }
  }
  forcePostMessageIpc();
  try {
    await withIpcTimeout(invoke("ui_ready"), IPC_PROBE_TIMEOUT_MS);
  } catch {
    // The native watchdog restarts once if the fallback also fails.
  }
}

void bootstrapIpc().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});

