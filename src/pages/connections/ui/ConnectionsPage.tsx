import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { engineAvailability } from "@/entities/connection/model/engineAvailability";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { Connection } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";

type Feedback = { kind: "info" | "error"; text: string } | null;

export const ConnectionsPage = observer(function ConnectionsPage({
  connections,
  engine,
}: {
  connections: ConnectionsStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const api = useMemo(() => new ConnectionApi(), []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    // The store also reacts to the engine becoming available; this covers a
    // direct mount while the agent is already running.
    void connections.load();
  }, [connections]);

  const availability = engineAvailability(engine.phase);
  const engineReady = availability === "ready";
  const engineActionBusy = engine.busy !== null || engine.isUpdating;
  const engineActionLabel =
    engine.busy === "start"
      ? t("actions.working")
      : engine.isUpdating
        ? t("actions.installing")
        : availability === "paused"
          ? t("actions.resume")
          : t("actions.startAgent");
  const engineBlockedText =
    availability === "paused"
      ? t("connections.enginePaused")
      : availability === "starting"
        ? t("connections.waiting")
        : (engine.statusError ?? t("connections.engineUnavailable"));
  const mutationsDisabled =
    !engineReady || busy !== null || engine.isUpdating;

  useEffect(() => {
    if (engineReady) {
      setStartError(null);
    }
  }, [engineReady]);

  const startAgent = async (): Promise<void> => {
    setStartError(null);
    const started = await engine.startEngine();
    if (!started) {
      setStartError(engine.error ?? t("errors.engineUnavailable"));
    }
  };

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
    if (!engineReady || engine.isUpdating) {
      return;
    }
    const key = `${connection.id}:${action}`;
    setBusy(key);
    setFeedback(null);
    try {
      if (action === "run") {
        const result = await api.run(connection.id);
        setFeedback({
          kind: "info",
          text: t("connections.runQueued", { jobId: result.jobId }),
        });
      } else {
        await api.test(connection.id);
        setFeedback({ kind: "info", text: t("connections.testOk") });
      }
    } catch (cause) {
      setFeedback({
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

  const showCard =
    connections.items.length > 0 ||
    connections.loading ||
    connections.loaded ||
    availability === "starting";

  const renderBody = () => {
    if (
      connections.loading &&
      !connections.loaded &&
      connections.items.length === 0
    ) {
      return (
        <p className="muted" role="status">
          {t("common.loading")}
        </p>
      );
    }

    if (filtered.length > 0) {
      return (
        <div className="table-wrap" aria-busy={connections.loading || undefined}>
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
                          aria-label={`${t("connections.open")} ${connection.id}`}
                        >
                          {t("connections.open")}
                        </Link>
                        <Button
                          variant="secondary"
                          className="btn-small"
                          disabled={mutationsDisabled}
                          aria-busy={busy === `${connection.id}:run`}
                          aria-label={`${t("connections.runNow")} ${connection.id}`}
                          onClick={() => void act(connection, "run")}
                        >
                          {busy === `${connection.id}:run`
                            ? t("actions.working")
                            : t("connections.runNow")}
                        </Button>
                        <Button
                          variant="secondary"
                          className="btn-small"
                          disabled={mutationsDisabled}
                          aria-busy={busy === `${connection.id}:test`}
                          aria-label={`${t("connections.test")} ${connection.id}`}
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
      );
    }

    if (!connections.loaded && connections.items.length === 0) {
      return (
        <p className="muted" role="status">
          {t("common.loading")}
        </p>
      );
    }

    if (query.trim()) {
      return (
        <div className="empty-state">
          <strong>{t("connections.noMatches")}</strong>
        </div>
      );
    }

    if (connections.loaded && connections.items.length === 0) {
      return (
        <div className="empty-state">
          <strong>{t("connections.empty")}</strong>
          <span>{t("connections.emptyHint")}</span>
        </div>
      );
    }

    return null;
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
            disabled={connections.loading || !engineReady}
            onClick={() => void connections.load(true)}
          >
            {connections.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
          <Button
            variant="primary"
            disabled={!engineReady}
            onClick={() => navigate("/connections/new")}
          >
            {t("connections.add")}
          </Button>
        </div>
      </div>

      {feedback ? (
        <Notice
          variant={feedback.kind}
          action={
            <Button variant="link" onClick={() => setFeedback(null)}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{feedback.text}</span>
        </Notice>
      ) : null}

      {connections.error ? (
        <Notice
          variant="error"
          action={
            <Button
              variant="link"
              disabled={!engineReady || connections.loading}
              onClick={() => void connections.load(true)}
            >
              {t("actions.retry")}
            </Button>
          }
        >
          <span>
            {t("connections.error")} {connections.error}
          </span>
        </Notice>
      ) : null}

      {availability !== "ready" ? (
        <Notice
          variant={
            startError || availability === "unavailable" ? "error" : "info"
          }
          action={
            availability === "starting" && !startError ? undefined : (
              <Button
                variant="link"
                disabled={engineActionBusy}
                onClick={() => void startAgent()}
              >
                {startError ? t("actions.retry") : engineActionLabel}
              </Button>
            )
          }
        >
          <span>{startError ?? engineBlockedText}</span>
        </Notice>
      ) : null}

      {showCard ? (
        <Card>
          <div className="toolbar" role="search">
            <input
              type="search"
              className="input"
              value={query}
              aria-label={t("connections.searchLabel")}
              placeholder={t("connections.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className="muted small">
              {t("connections.count", { count: filtered.length })}
            </span>
          </div>

          {renderBody()}
        </Card>
      ) : null}
    </div>
  );
});
