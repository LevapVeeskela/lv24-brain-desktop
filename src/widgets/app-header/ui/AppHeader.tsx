import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { StatusPill } from "@/entities/engine/ui/StatusPill";
import { LocaleSwitch } from "@/features/locale-switch/ui/LocaleSwitch";
import { useI18n, type MessageKey } from "@/shared/i18n";

export const AppHeader = observer(function AppHeader({
  engine,
  section,
}: {
  engine: EngineStore;
  section: MessageKey;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar app-header">
      <div className="app-header-title">
        <strong>{t(section)}</strong>
        <span>{t("app.subtitle")}</span>
      </div>
      <div className="topbar-actions app-header-actions">
        {engine.status?.machine ? (
          <span className="machine-chip" title={t("settings.machine")}>
            {engine.status.machine}
          </span>
        ) : null}
        <LocaleSwitch />
        <StatusPill phase={engine.phase} />
      </div>
    </header>
  );
});
