import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const PathsCard = observer(function PathsCard({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const status = engine.status;
  const details = [
    [t("paths.config"), status?.engine.configPath, t("paths.notResolved")],
    [t("paths.data"), status?.engine.dataDir, t("paths.notResolved")],
    [t("paths.binary"), status?.engine.engineBin, t("paths.notFound")],
    [t("paths.source"), status?.engine.engineSource, t("engine.none")],
    [t("paths.logs"), status?.logDir, t("paths.notResolved")],
  ] as const;

  return (
    <Card>
      <h3>{t("paths.title")}</h3>
      <dl className="details paths">
        {details.map(([label, value, fallback]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>
              <code>{value ?? fallback}</code>
            </dd>
          </Fragment>
        ))}
      </dl>
    </Card>
  );
});
