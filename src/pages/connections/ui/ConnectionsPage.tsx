import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { Connection } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";

type Message = { kind: "info" | "error"; text: string } | null;

export const ConnectionsPage = observer(function ConnectionsPage({
  connections,
  engine,
}: {
  connections: ConnectionsStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const api = useMemo(() => new ConnectionApi(), []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    void connections.load();
  }, [connections]);

  const filtered = connections.items.filter((connection) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [connection.id, connection.provider, connection.account ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const act = async (
    connection: Connection,
    action: "run" | "test",
  ): Promise<void> => {
    const key = `${connection.id}:${action}`;
    setBusy(key);
    setMessage(null);
    try {
      if (action === "run") {
        const result = await api.run(connection.id);
        setMessage({
          kind: "info",
          text: t("connections.runQueued", { jobId: result.jobId }),
        });
      } else {
        await api.test(connection.id);
        setMessage({ kind: "info", text: t("connections.testOk") });
      }
    } catch (cause) {
      setMessage({
        kind: "error",
        text:
          action === "test"
            ? `${t("connections.testFailed")} ${errorMessage(cause)}`
            : errorMessage(cause),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("connections.title")}</h2>
          <p className="muted">{t("connections.subtitle")}</p>
        </div>
        <div className="page-actions">
          <Button
            variant="secondary"
            disabled={connections.loading || !engine.isRunning}
            onClick={() => void connections.load(true)}
          >
            {connections.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
          <Link className="btn btn-primary" to="/connections/new">
            {t("connections.add")}
          </Link>
        </div>
      </div>

      {message ? (
        <Notice
          variant={message.kind}
          action={
            <Button variant="link" onClick={() => setMessage(null)}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{message.text}</span>
        </Notice>
      ) : null}

      {connections.error ? (
        <Notice variant="error">
          <span>
            {t("connections.error")} {connections.error}
          </span>
        </Notice>
      ) : null}

      {!engine.isRunning && !connections.loaded ? (
        <Notice variant="info">
          <span>
            {engine.isPaused ? t("connections.paused") : t("connections.waiting")}
          </span>
        </Notice>
      ) : null}

      <Card>
        <div className="toolbar">
          <input
            className="input"
            value={query}
            placeholder={t("connections.searchPlaceholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="muted small">
            {t("connections.count", { count: filtered.length })}
          </span>
        </div>

        {connections.loading && !connections.loaded ? (
          <p className="muted">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <strong>{t("connections.empty")}</strong>
            <span>{t("connections.emptyHint")}</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.id")}</th>
                  <th>{t("connections.provider")}</th>
                  <th>{t("connections.schedule")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((connection) => {
                  const schedule =
                    !connection.schedule || connection.schedule === "manual"
                      ? t("connections.scheduleManual")
                      : connection.schedule;
                  return (
                    <tr key={connection.id}>
                      <td>
                        <Link
                          className="table-link"
                          to={`/connections/${encodeURIComponent(connection.id)}`}
                        >
                          {connection.id}
                        </Link>
                        {connection.account ? (
                          <span className="table-sub">{connection.account}</span>
                        ) : null}
                      </td>
                      <td>{connection.provider}</td>
                      <td>
                        <span className="badge">{schedule}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link
                            className="btn btn-secondary btn-small"
                            to={`/connections/${encodeURIComponent(connection.id)}`}
                          >
                            {t("connections.open")}
                          </Link>
                          <Button
                            variant="secondary"
                            className="btn-small"
                            disabled={busy !== null}
                            onClick={() => void act(connection, "run")}
                          >
                            {busy === `${connection.id}:run`
                              ? t("actions.working")
                              : t("connections.runNow")}
                          </Button>
                          <Button
                            variant="secondary"
                            className="btn-small"
                            disabled={busy !== null}
                            onClick={() => void act(connection, "test")}
                          >
                            {busy === `${connection.id}:test`
                              ? t("actions.working")
                              : t("connections.test")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
});
