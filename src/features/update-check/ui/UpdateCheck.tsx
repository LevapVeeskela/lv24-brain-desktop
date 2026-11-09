import { observer } from "mobx-react-lite";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const UpdateCheck = observer(function UpdateCheck({
  settings,
}: {
  settings: SettingsStore;
}) {
  const { t } = useI18n();
  const update = settings.update;
  const busy = settings.checkingUpdate || settings.installingUpdate;

  return (
    <Card>
      <h3>{t("update.title")}</h3>
      <p className="muted small">{t("update.signed")}</p>
      {update?.available ? (
        <div className="update-box">
          <strong>
            {t("update.available", { version: update.version ?? "?" })}
          </strong>
          <p className="muted small">
            {update.notes?.trim() || t("update.notesFallback")}
          </p>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void settings.installUpdate()}
          >
            {settings.installingUpdate
              ? t("actions.installing")
              : t("update.install")}
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void settings.checkUpdate()}
        >
          {settings.checkingUpdate ? t("actions.checking") : t("update.check")}
        </Button>
      )}
      {update && !update.available ? (
        <p className="muted small">{t("update.latest")}</p>
      ) : null}
      {settings.error ? (
        <p className="inline-error">
          {settings.error}{" "}
          <Button variant="link" onClick={settings.dismissError}>
            {t("actions.dismiss")}
          </Button>
        </p>
      ) : null}
    </Card>
  );
});
