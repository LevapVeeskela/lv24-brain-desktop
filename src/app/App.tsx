import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "../shared/api/desktop";
import type {
  EnginePhase,
  EngineStatus,
  ShellStatus,
  SyncSummary,
  UpdateInfo,
} from "../shared/api/types";

const phaseLabels: Record<EnginePhase, string> = {
  starting: "Starting",
  running: "Running",
  paused: "Paused",
  error: "Error",
  stopped: "Stopped",
};

function Logo() {
  return (
    <svg
      className="logo"
      viewBox="0 0 48 48"
      role="img"
      aria-label="LV24 Brain"
    >
      <rect width="48" height="48" rx="12" fill="#0b1220" />
      <g stroke="#34d399" strokeWidth="2.2" strokeLinecap="round">
        <path d="M24 11v26M14 18l20 12M34 18 14 30" opacity=".55" />
      </g>
      <g fill="#34d399">
        <circle cx="24" cy="11" r="3.4" />
        <circle cx="24" cy="37" r="3.4" />
        <circle cx="14" cy="18" r="3" />
        <circle cx="34" cy="18" r="3" />
        <circle cx="14" cy="30" r="3" />
        <circle cx="34" cy="30" r="3" />
        <circle cx="24" cy="24" r="4.6" />
      </g>
      <circle cx="24" cy="24" r="2" fill="#0b1220" />
    </svg>
  );
}

function describePhase(status: ShellStatus | null): string {
  if (!status) return "Connecting to the shell";
  if (status.paused) return "Background sync is paused";
  if (status.engine.phase === "running") {
    return status.engine.owned
      ? "Agent running under desktop supervision"
      : "Agent running in another process";
  }
  if (status.engine.phase === "starting") return "Starting the brain agent";
  if (status.engine.phase === "error") return "The agent needs attention";
  return "Agent is not running";
}

export function App() {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [sync, setSync] = useState<SyncSummary | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [connections, setConnections] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await desktop.status();
      setStatus(next);
      if (next.engine.running) {
        const response = await desktop.api("GET", "/v1/connections");
        if (response.status === 200) {
          const parsed: unknown = JSON.parse(response.body);
          setConnections(Array.isArray(parsed) ? parsed.length : null);
        }
      } else {
        setConnections(null);
      }
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const listeners = [
      listen<EngineStatus>("engine-status", (event) =>
        setStatus((current) =>
          current ? { ...current, engine: event.payload } : current,
        ),
      ),
      listen<string[]>("oauth-callback", (event) =>
        setDeepLink(event.payload[0] ?? null),
      ),
      listen<string>("shell-error", (event) => setError(event.payload)),
    ];
    void desktop
      .takeDeepLink()
      .then((url) => {
        if (url) setDeepLink(url);
      })
      .catch(() => undefined);
    return () => {
      for (const pending of listeners) {
        void pending.then((unlisten) => unlisten()).catch(() => undefined);
      }
    };
  }, []);

  const run = async (
    label: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const paused = status?.paused ?? false;
  const running = status?.engine.running ?? false;
  const phase = status?.engine.phase ?? "starting";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <h1>LV24 Brain</h1>
            <p>Local memory engine</p>
          </div>
        </div>
        <div className={`status-pill status-${phase}`}>
          <span className="status-dot" aria-hidden="true" />
          {paused ? "Paused" : phaseLabels[phase]}
        </div>
      </header>

      <main className="content">
        <section className="card hero">
          <div>
            <p className="eyebrow">Background agent</p>
            <h2>{describePhase(status)}</h2>
            <p className="muted">
              {running && status?.engine.version
                ? `Engine ${status.engine.version} on port ${status.engine.port}`
                : "The tray keeps the agent available when this window is closed."}
            </p>
          </div>
          <div className="hero-actions">
            <button
              type="button"
              className="primary"
              disabled={busy !== null}
              onClick={() =>
                void run(paused ? "resume" : "pause", async () => {
                  const next = paused
                    ? await desktop.startEngine()
                    : await desktop.pauseEngine();
                  setStatus(next);
                })
              }
            >
              {busy === "resume" || busy === "pause"
                ? "Working…"
                : paused
                  ? "Resume sync"
                  : "Pause sync"}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy !== null}
              onClick={() =>
                void run("sync", async () => {
                  setSync(await desktop.syncAll());
                })
              }
            >
              {busy === "sync" ? "Syncing…" : "Sync all"}
            </button>
          </div>
        </section>

        {error ? (
          <section className="notice error" role="alert">
            <strong>Something needs attention.</strong>
            <span>{error}</span>
            <button
              type="button"
              className="link"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </section>
        ) : null}

        {sync ? (
          <section className="notice info">
            <strong>
              Queued {sync.queued} of {sync.total} connections.
            </strong>
            {sync.failures.length > 0 ? (
              <span>
                {sync.failures
                  .map((failure) => `${failure.connectionId}: ${failure.error}`)
                  .join(" · ")}
              </span>
            ) : (
              <span>Every configured connection accepted the run request.</span>
            )}
          </section>
        ) : null}

        <section className="grid">
          <article className="card">
            <h3>Engine</h3>
            <dl className="details">
              <dt>Status</dt>
              <dd>{paused ? "Paused" : phaseLabels[phase]}</dd>
              <dt>PID</dt>
              <dd>{status?.engine.pid ?? "—"}</dd>
              <dt>Port</dt>
              <dd>{status?.engine.port ?? "—"}</dd>
              <dt>Version</dt>
              <dd>{status?.engine.version ?? "—"}</dd>
              <dt>Supervised</dt>
              <dd>{status?.engine.owned ? "Yes" : "External"}</dd>
              <dt>Connections</dt>
              <dd>{connections ?? "—"}</dd>
            </dl>
            {status?.engine.lastError ? (
              <p className="inline-error">{status.engine.lastError}</p>
            ) : null}
          </article>

          <article className="card">
            <h3>Paths</h3>
            <dl className="details paths">
              <dt>Config</dt>
              <dd>
                <code>{status?.engine.configPath ?? "not resolved"}</code>
              </dd>
              <dt>Data</dt>
              <dd>
                <code>{status?.engine.dataDir ?? "not resolved"}</code>
              </dd>
              <dt>Binary</dt>
              <dd>
                <code>{status?.engine.engineBin ?? "not found"}</code>
              </dd>
              <dt>Source</dt>
              <dd>{status?.engine.engineSource ?? "—"}</dd>
              <dt>Logs</dt>
              <dd>
                <code>{status?.logDir ?? "not resolved"}</code>
              </dd>
            </dl>
          </article>

          <article className="card">
            <h3>Startup</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={status?.autostart.enabled ?? false}
                disabled={busy !== null || !status?.autostart.supported}
                onChange={(event) =>
                  void run("autostart", async () => {
                    const next = await desktop.setAutostart(
                      event.target.checked,
                    );
                    setStatus(next);
                  })
                }
              />
              <span>
                <strong>Launch at login</strong>
                <small>
                  {status?.autostart.enabled
                    ? "Registered with the operating system."
                    : status?.autostart.detail ??
                      "Start the tray agent after you sign in."}
                </small>
              </span>
            </label>
            <p className="muted small">
              Pausing is persistent. The agent stays stopped until you resume
              it, even after a restart.
            </p>
          </article>

          <article className="card">
            <h3>Desktop update</h3>
            <p className="muted small">
              Updates are signed with an Ed25519 key and verified before
              installation.
            </p>
            {update?.available ? (
              <div className="update-box">
                <strong>Version {update.version} is available</strong>
                <p className="muted small">{update.notes ?? "No notes."}</p>
                <button
                  type="button"
                  className="primary"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("update", async () => {
                      await desktop.installUpdate();
                    })
                  }
                >
                  {busy === "update" ? "Installing…" : "Install update"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="secondary"
                disabled={busy !== null}
                onClick={() =>
                  void run("check", async () => {
                    setUpdate(await desktop.checkUpdate());
                  })
                }
              >
                {busy === "check" ? "Checking…" : "Check for updates"}
              </button>
            )}
            {update && !update.available ? (
              <p className="muted small">You are on the latest desktop build.</p>
            ) : null}
          </article>
        </section>

        {deepLink ? (
          <section className="card deep-link">
            <h3>OAuth callback</h3>
            <p className="muted small">
              Received through <code>{status?.deepLinkScheme ?? "lv24brain"}://</code>
            </p>
            <code className="callback">{deepLink}</code>
          </section>
        ) : null}
      </main>

      <footer className="footer">
        <span>
          Desktop {status?.desktopVersion ?? "0.1.0"} · engine{" "}
          {status?.engine.version ?? "offline"}
        </span>
        <button
          type="button"
          className="link"
          disabled={busy !== null}
          onClick={() => void run("quit", () => desktop.quit())}
        >
          Quit
        </button>
      </footer>
    </div>
  );
}
