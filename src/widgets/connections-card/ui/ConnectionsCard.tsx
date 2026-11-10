import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const ConnectionsCard = observer(function ConnectionsCard({
  connections,
  engine,
}: {
  connections: ConnectionsStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const empty = connections.loaded && connections.items.length === 0;
  const summary = connections.loaded
    ? t("connections.count", { count: connections.count })
    : connections.loading
      ? t("connections.loading")
      : engine.isPaused
        ? t("connections.paused")
        : t("connections.waiting");

  return (
    <Card className="connections-card">
      <div className="card-header">
        <div>
          <h3>{t("connections.title")}</h3>
          <p className="muted small">{summary}</p>
        </div>
        <Button
          variant="secondary"
          disabled={connections.loading || !engine.isRunning}
          onClick={() => void connections.load(true)}
        >
          {connections.loading ? t("actions.working") : t("actions.refresh")}
        </Button>
      </div>

      {connections.error ? (
        <p className="inline-error">
          {t("connections.error")} {connections.error}
        </p>
      ) : null}

      {empty ? (
        <div className="empty-state">
          <strong>{t("connections.empty")}</strong>
          <span>{t("connections.emptyHint")}</span>
          <Link className="text-link" to="/connections/new">
            {t("connections.add")}
          </Link>
        </div>
      ) : null}

      {connections.items.length > 0 ? (
        <ul className="connection-list">
          {connections.items.map((connection) => (
            <li className="connection-row" key={connection.id}>
              <div className="connection-main">
                <code className="connection-id">{connection.id}</code>
                <span className="connection-meta">
                  {connection.provider}
                  {connection.account ? ` · ${connection.account}` : ""}
                </span>
              </div>
              <div className="connection-badges">
                {connection.publish === "local-only" ? (
                  <span className="badge badge-local">
                    {t("connections.localOnly")}
                  </span>
                ) : null}
                <span className="badge">
                  {!connection.schedule || connection.schedule === "manual"
                    ? t("connections.scheduleManual")
                    : connection.schedule}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
});
