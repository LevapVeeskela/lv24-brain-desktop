import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { StatusPill } from "@/entities/engine/ui/StatusPill";
import { LocaleSwitch } from "@/features/locale-switch/ui/LocaleSwitch";
import { useI18n } from "@/shared/i18n";

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

export const AppHeader = observer(function AppHeader({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <h1>{t("app.title")}</h1>
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
