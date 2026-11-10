import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { InlineError } from "@/shared/ui/InlineError";
import { useI18n } from "@/shared/i18n";

export const UpdateCheck = observer(function UpdateCheck({
  settings,
}: {
  settings: SettingsStore;
}) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const update = settings.update;
  const installing = settings.installingUpdate || settings.restartPending;
  const busy = settings.checkingUpdate || installing;
  const percent = settings.updatePercent;
  const stage = settings.updateStage;
  // Announce at stage changes and at most every 10% to avoid live-region spam.
  const percentStep = percent === null ? null : Math.floor(percent / 10) * 10;

  useEffect(() => {
    if (!installing) {
      setAnnouncement("");
      return;
    }
    if (stage === "restarting") {
      setAnnouncement(t("update.restarting"));
      return;
    }
    if (stage === "downloading" && percentStep !== null) {
      setAnnouncement(t("update.progress", { percent: percentStep }));
      return;
    }
    setAnnouncement(t("update.installingStatus"));
  }, [installing, stage, percentStep, t]);

  const errorPrefix =
    settings.errorKind === "install"
      ? t("update.installFailed")
      : t("update.checkFailed");

  return (
    <Card>
      <h3>{t("update.title")}</h3>
      <p className="muted small">{t("update.signed")}</p>

      {installing ? (
        <div className="update-box">
          <strong role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </strong>
          {percent !== null ? (
            <progress
              max={100}
              value={percent}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={t("update.progress", { percent })}
              aria-label={t("update.title")}
            />
          ) : null}
          {percent !== null && stage !== "restarting" ? (
            <p className="muted small">{t("update.progress", { percent })}</p>
          ) : null}
        </div>
      ) : update?.available ? (
        <div className="update-box" role="status" aria-live="polite">
          <strong>
            {t("update.available", { version: update.version ?? "?" })}
          </strong>
          <p className="muted small">
            {update.notes?.trim() || t("update.notesFallback")}
          </p>
          <Button
            variant="primary"
            disabled={busy}
            aria-busy={settings.installingUpdate}
            onClick={() => {
              if (!busy) {
                setConfirmOpen(true);
              }
            }}
          >
            {t("update.install")}
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={busy}
          aria-busy={settings.checkingUpdate}
          onClick={() => {
            if (!busy) {
              void settings.checkUpdate();
            }
          }}
        >
          <span role="status" aria-live="polite">
            {settings.checkingUpdate
              ? t("actions.checking")
              : t("update.check")}
          </span>
        </Button>
      )}

      {update && !update.available && !settings.installingUpdate ? (
        <p className="muted small" role="status" aria-live="polite">
          {t("update.latest")}
        </p>
      ) : null}

      {settings.error ? (
        <InlineError>
          <span>{errorPrefix}</span>{" "}
          <span>{settings.error}</span>{" "}
          <Button variant="link" onClick={settings.dismissError}>
            {t("actions.dismiss")}
          </Button>
        </InlineError>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title={t("update.title")}
        confirmLabel={t("update.install")}
        cancelLabel={t("common.cancel")}
        danger
        busy={settings.installingUpdate}
        onConfirm={() => {
          setConfirmOpen(false);
          void settings.installUpdate();
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>{t("update.confirm")}</p>
      </ConfirmDialog>
    </Card>
  );
});
