import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { InlineError } from "@/shared/ui/InlineError";
import { useI18n } from "@/shared/i18n";

export const AutostartToggle = observer(function AutostartToggle({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const autostart = engine.autostart;
  const updating = engine.isUpdating;
  const busy = engine.busy !== null || updating;
  const unavailable = engine.status === null;
  const unsupported = autostart !== null && !autostart.supported;
  // The installer replaces the agent binaries; toggling autostart now would
  // race it, so the control stays locked for the whole update window.
  const disabled = unavailable || unsupported || updating;

  const hint = updating
    ? t("update.installingStatus")
    : engine.busy !== null
      ? t("actions.working")
      : autostart?.enabled
        ? t("startup.registered")
        : (autostart?.detail ??
          (unavailable
            ? engine.phase === "unavailable"
              ? t("errors.engineUnavailable")
              : t("common.loading")
            : t("startup.hint")));

  return (
    <Card>
      <h3>{t("startup.title")}</h3>
      <label className="toggle">
        <input
          type="checkbox"
          checked={autostart?.enabled ?? false}
          disabled={disabled || busy}
          aria-busy={busy}
          onChange={(event) => {
            if (disabled || busy) {
              return;
            }
            void engine.setAutostart(event.target.checked);
          }}
        />
        <span>
          <strong>{t("startup.launchAtLogin")}</strong>
          <small>{hint}</small>
        </span>
      </label>
      {unsupported ? (
        <p className="muted small">{t("settings.autostartUnsupported")}</p>
      ) : null}
      {engine.autostartError ? (
        <InlineError>
          <span>{t("settings.autostartError")}</span>{" "}
          <span>{engine.autostartError}</span>{" "}
          <Button
            variant="link"
            disabled={busy}
            aria-busy={engine.busy === "autostart"}
            onClick={() => {
              if (!busy) {
                void engine.retryAutostart();
              }
            }}
          >
            {engine.busy === "autostart"
              ? t("actions.working")
              : t("actions.retry")}
          </Button>
        </InlineError>
      ) : null}
      <p className="muted small">{t("startup.pauseNote")}</p>
    </Card>
  );
});
