import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { App } from "./app/App";
import "./app/styles/global.css";

// First IPC handshake for the native startup watchdog. It deliberately uses
// the raw invoke: the recovery wrapper is for user-facing commands, while this
// probe must fail quietly and let the Rust watchdog restart a broken webview.
void invoke("ui_ready").catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
