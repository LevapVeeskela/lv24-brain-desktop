import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const AutostartToggle = observer(function AutostartToggle({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const autostart = engine.autostart;
  const disabled =
    engine.busy !== null || !autostart?.supported || engine.status === null;

  return (
    <Card>
      <h3>{t("startup.title")}</h3>
      <label className="toggle">
        <input
          type="checkbox"
          checked={autostart?.enabled ?? false}
          disabled={disabled}
          onChange={(event) =>
            void engine.setAutostart(event.target.checked)
          }
        />
        <span>
          <strong>{t("startup.launchAtLogin")}</strong>
          <small>
            {autostart?.enabled
              ? t("startup.registered")
              : (autostart?.detail ?? t("startup.hint"))}
          </small>
        </span>
      </label>
      <p className="muted small">{t("startup.pauseNote")}</p>
    </Card>
  );
});
