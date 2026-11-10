/**
 * Development-only visual QA fixture. This file is never imported by src/main.
 * Use /scripts/design-preview.html?locale=ru&state=normal#/connections
 * States: normal | empty | error | loading. All records are fictional.
 * @tauri-apps/api/mocks intercepts IPC and events; no engine/network is used.
 */
import ReactDOM from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { Connection, Run } from "../src/entities/connection/model/types";
import type { ShellStatus } from "../src/entities/engine/model/types";
import type { ProviderDescriptor } from "../src/entities/provider/model/types";
import { App } from "../src/app/App";
import "../src/app/styles/global.css";

if (!import.meta.env.DEV || !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
  throw new Error("Design fixtures are restricted to a local development server.");
}

const query = new URLSearchParams(location.search);
const locale = query.get("locale") === "ru" ? "ru" : "en";
const requestedState = query.get("state");
const state = requestedState === "empty" || requestedState === "error" || requestedState === "loading"
  ? requestedState
  : "normal";
localStorage.setItem("lv24.locale", locale);
document.documentElement.lang = locale;
document.body.dataset.fixtureState = state;
document.body.dataset.fixtureLocale = locale;

const shell: ShellStatus = {
  engine: {
    phase: "running",
    running: true,
    owned: true,
    pid: 12024,
    port: 41234,
    version: "0.13.1",
    startedAt: "2026-11-10T08:00:00Z",
    dataDir: "C:\\Example\\Brain\\data",
    configPath: "C:\\Example\\Brain\\brain.yaml",
    engineBin: "C:\\Example\\Brain\\brain.exe",
    engineSource: "bundled",
    updateChannel: "stable",
    restarts: 0,
  },
  paused: false,
  updating: false,
  autostart: { enabled: true, supported: true },
  desktopVersion: "1.0.1",
  deepLinkScheme: "lv24brain",
  logDir: "C:\\Example\\Brain\\logs",
};

const seedConnections: Connection[] = [
  { id: "github-team", provider: "github", backend: "native", account: "example-team", projects: ["atlas"], schedule: "@hourly", publish: "local-only", settings: { repositories: "example-team/atlas", streams: "issues,pulls" } },
  { id: "github-design", provider: "github", backend: "native", account: "example-design", projects: ["design"], schedule: "@daily", publish: "local-only", settings: { repositories: "example-design/system" } },
  { id: "gitlab-platform", provider: "gitlab", backend: "native", account: "example-platform", projects: ["platform"], schedule: "@hourly", publish: "shared" },
  { id: "local-notes", provider: "file", backend: "native", projects: ["atlas"], schedule: "manual", publish: "local-only", settings: { path: "C:\\Example\\Notes" } },
  { id: "github-mobile", provider: "github", backend: "native", account: "example-mobile", projects: ["mobile"], schedule: "@daily", publish: "local-only" },
  { id: "gitlab-infra", provider: "gitlab", backend: "native", account: "example-infra", projects: ["platform"], schedule: "@hourly", publish: "local-only" },
  { id: "research-notes", provider: "file", backend: "native", projects: ["design"], schedule: "manual", publish: "local-only", settings: { path: "C:\\Example\\Research" } },
  { id: "github-docs", provider: "github", backend: "native", account: "example-docs", projects: ["atlas"], schedule: "@daily", publish: "shared" },
  { id: "archive", provider: "file", backend: "native", schedule: "manual", publish: "local-only", settings: { path: "C:\\Example\\Archive" } },
  { id: "github-new", provider: "github", backend: "native", account: "example-new", projects: ["mobile"], schedule: "manual", publish: "local-only" },
];
let connections = state === "empty" ? [] : structuredClone(seedConnections);

const statuses = ["success", "failed", "partial", "running", "success", "success", "partial", "success"] as const;
const runs: Run[] = state === "empty" ? [] : statuses.map((status, index) => ({
  id: `${seedConnections[index].id}-20261110-${index + 1}`,
  connectionId: seedConnections[index].id,
  source: seedConnections[index].provider,
  status,
  startedAt: `2026-11-10T09:${String(45 - index * 4).padStart(2, "0")}:00Z`,
  finishedAt: status === "running" ? undefined : `2026-11-10T09:${String(46 - index * 4).padStart(2, "0")}:08Z`,
  counts: { seen: 42 + index * 7, indexed: status === "failed" ? 0 : 12 + index },
  stats: { seen: 42 + index * 7, upserted: status === "failed" ? 0 : 12 + index, unchanged: 30, deleted: 0, skipped: status === "partial" ? 3 : 0, batches: 2 },
}));

const projects = state === "empty" ? [] : [
  { id: "atlas", name: locale === "ru" ? "Атлас — инженерная база знаний" : "Atlas — engineering knowledge" },
  { id: "design", name: locale === "ru" ? "Дизайн-система" : "Design system" },
  { id: "platform", name: locale === "ru" ? "Платформа и инфраструктура" : "Platform & infrastructure" },
  { id: "mobile", name: locale === "ru" ? "Мобильное приложение" : "Mobile application" },
];

const providers: ProviderDescriptor[] = [
  {
    provider: "github", displayName: "GitHub", defaultPublish: "local-only",
    capabilities: { backfill: true, incremental: true, deletes: true, actions: false, authModes: ["token", "oauth-device"] },
    configFields: [
      { key: "repositories", label: locale === "ru" ? "Репозитории" : "Repositories", required: true, secret: false, help: "example-team/atlas" },
      { key: "token", label: locale === "ru" ? "Токен доступа" : "Access token", required: true, secret: true },
    ], backends: ["native"], streams: ["issues", "pulls", "discussions"],
  },
  {
    provider: "gitlab", displayName: "GitLab", defaultPublish: "local-only",
    capabilities: { backfill: true, incremental: true, deletes: true, actions: false, authModes: ["token", "oauth-pkce"] },
    configFields: [{ key: "token", label: locale === "ru" ? "Токен доступа" : "Access token", required: true, secret: true }],
    backends: ["native"], streams: ["issues", "merge_requests"],
  },
  {
    provider: "file", displayName: locale === "ru" ? "Локальные файлы" : "Local files", defaultPublish: "local-only",
    capabilities: { backfill: true, incremental: true, deletes: false, actions: false, authModes: ["none"] },
    configFields: [{ key: "path", label: locale === "ru" ? "Путь к папке" : "Folder path", required: true, secret: false, help: "C:\\Example\\Notes" }],
    backends: ["native"], streams: ["files"],
  },
];

// Names only. There are deliberately no credential values in this fixture.
const secretNames = state === "empty" ? [] : ["CONN_GITHUB_TEAM_OAUTH", "CONN_GITHUB_TEAM_OAUTHMETA", "CONN_GITHUB_DESIGN_TOKEN", "CONN_GITLAB_PLATFORM_TOKEN"];
const failure = locale === "ru"
  ? "Демонстрационная ошибка: источник временно недоступен. Повторите попытку."
  : "Fixture error: the source is temporarily unavailable. Try again.";

function response(body: unknown, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

async function waitForFixtureData(): Promise<void> {
  if (state === "loading") await new Promise<void>(() => undefined);
}

async function localApi(args: Record<string, unknown>) {
  await waitForFixtureData();
  if (state === "error") return response({ error: { code: "fixture_unavailable", message: failure } }, 503);
  const path = new URL(String(args.path), "http://fixture.invalid").pathname;
  const method = String(args.method);
  if (path === "/v1/projects") return response(projects);
  if (path === "/v1/runs") return response(runs);
  if (path === "/v1/schedules") return response(connections.map((item) => ({ connectionId: item.id, schedule: item.schedule ?? "manual" })));
  if (path === "/v1/connections") {
    if (method === "GET") return response(connections);
    if (method === "POST") {
      const body: unknown = JSON.parse(String(args.body));
      if (typeof body === "object" && body !== null && "id" in body && "provider" in body) {
        const connection = body as Connection;
        connections.push(connection);
        return response(connection, 201);
      }
      return response({ error: { code: "fixture_invalid", message: "Invalid fixture payload" } }, 400);
    }
  }
  const match = path.match(/^\/v1\/connections\/([^/]+)(?:\/(.*))?$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const connection = connections.find((item) => item.id === id);
    if (!connection) return response({ error: { code: "not_found", message: "Fixture connection not found" } }, 404);
    if (method === "GET") return response(connection);
    if (method === "DELETE") {
      connections = connections.filter((item) => item.id !== id);
      return response(null, 204);
    }
    if (match[2] === "run") return response({ jobId: `${id}-fixture-run` }, 202);
    return response({}, 200);
  }
  if (path.startsWith("/v1/schedules/")) return response({}, 200);
  throw new Error(`Unimplemented fixture API: ${method} ${path}`);
}

let logSequence = 0;
mockWindows("main");
mockIPC(async (command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  switch (command) {
    case "shell_status": return structuredClone(shell);
    case "deep_link_take": return null;
    case "engine_start":
      shell.engine.phase = "running";
      shell.engine.running = true;
      shell.paused = false;
      return structuredClone(shell);
    case "engine_pause":
      shell.engine.phase = "paused";
      shell.engine.running = false;
      shell.paused = true;
      return structuredClone(shell);
    case "autostart_set":
      shell.autostart.enabled = Boolean(args.enabled);
      return structuredClone(shell);
    case "app_quit": return undefined;
    case "engine_providers":
      await waitForFixtureData();
      if (state === "error") throw new Error(failure);
      return state === "empty" ? [] : providers;
    case "engine_secrets":
      await waitForFixtureData();
      if (state === "error") throw new Error(failure);
      return secretNames;
    case "engine_connection_auth": return { exitCode: 0, output: "Fixture authorization completed locally; no provider was contacted." };
    case "update_check":
      await waitForFixtureData();
      if (state === "error") throw new Error(failure);
      return { available: false };
    case "update_install": throw new Error("Install is disabled in visual fixtures.");
    case "api_request": return localApi(args);
    case "run_log_open": {
      const streamId = `fixture-log-${++logSequence}`;
      // A bounded snapshot, not simulated ongoing tailing.
      window.setTimeout(() => {
        void emit("run-log", { streamId, event: "info", data: "2026-11-10 09:45:00 · Fixture snapshot · Reading configured source" });
        void emit("run-log", { streamId, event: "stdout", data: "42 records scanned, 12 indexed, 30 unchanged" });
        if (String(args.runId).includes("design")) {
          void emit("run-log", { streamId, event: "stderr", data: "Source unavailable (fictional fixture). Review authentication and retry." });
        }
        void emit("run-log-end", { streamId });
      }, 80);
      return streamId;
    }
    case "run_log_close": return undefined;
    default: throw new Error(`Unimplemented fixture command: ${command}`);
  }
}, { shouldMockEvents: true });

const root = document.getElementById("root");
if (!root) throw new Error("Fixture root is missing");
// Match production effect semantics. Development StrictMode intentionally
// remounts effects and can duplicate pending mocked event subscriptions.
ReactDOM.createRoot(root).render(<App />);
