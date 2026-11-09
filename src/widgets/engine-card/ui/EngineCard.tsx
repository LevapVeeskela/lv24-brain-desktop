import { observer } from "mobx-react-lite";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const EngineCard = observer(function EngineCard({
  engine,
  connections,
}: {
  engine: EngineStore;
  connections: ConnectionsStore;
}) {
  const { t } = useI18n();
  const status = engine.engine;

  return (
    <Card>
      <h3>{t("engine.title")}</h3>
      <dl className="details">
        <dt>{t("engine.status")}</dt>
        <dd>{t(`status.${engine.phase}`)}</dd>
        <dt>{t("engine.pid")}</dt>
        <dd>{status?.pid ?? t("engine.none")}</dd>
        <dt>{t("engine.port")}</dt>
        <dd>{status?.port ?? t("engine.none")}</dd>
        <dt>{t("engine.version")}</dt>
        <dd>{status?.version ?? t("engine.none")}</dd>
        <dt>{t("engine.supervised")}</dt>
        <dd>
          {status?.owned
            ? t("engine.yes")
            : engine.isPaused
              ? t("engine.none")
              : t("engine.external")}
        </dd>
        <dt>{t("engine.connections")}</dt>
        <dd>{connections.loaded ? connections.count : t("engine.none")}</dd>
      </dl>
      {status?.lastError ? (
        <p className="inline-error">
          <strong>{t("engine.lastError")}:</strong> {status.lastError}
        </p>
      ) : null}
    </Card>
  );
});
