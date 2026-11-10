import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { BrandMark } from "@/shared/brand/BrandMark";
import { StatusPill } from "@/entities/engine/ui/StatusPill";
import { LocaleSwitch } from "@/features/locale-switch/ui/LocaleSwitch";
import { useI18n } from "@/shared/i18n";

export const AppHeader = observer(function AppHeader({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark className="logo" />
        <div className="brand-copy">
          <h1 className="wordmark" aria-label={t("app.title")}><span>LV24</span><strong>Brain</strong></h1>
          <p>{t("app.subtitle")}</p>
        </div>
      </div>
      <div className="topbar-actions">
        <LocaleSwitch />
        <StatusPill phase={engine.phase} />
      </div>
    </header>
  );
});
