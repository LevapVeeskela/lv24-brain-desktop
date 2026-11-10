import { observer } from "mobx-react-lite";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { enginePhaseMessageKey } from "@/entities/engine/model/labels";
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
  const phase = engine.phase;
  const lastError = status ? status.lastError : engine.statusError;

  return (
    <Card>
      <h3>{t("engine.title")}</h3>
      <dl className="details">
        <dt>{t("engine.status")}</dt>
        <dd>{t(enginePhaseMessageKey(phase))}</dd>
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
            : phase === "running"
              ? t("engine.external")
              : t("engine.none")}
        </dd>
        <dt>{t("engine.connections")}</dt>
        <dd>{connections.loaded ? connections.count : t("engine.none")}</dd>
      </dl>
      {lastError ? (
        <p className="inline-error">
          <strong>{t("engine.lastError")}:</strong> {lastError}
        </p>
      ) : null}
    </Card>
  );
});
