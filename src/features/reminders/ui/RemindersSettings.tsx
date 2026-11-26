import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import type { MessageKey } from "@/shared/i18n";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Field, FormRow } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import { useRemindersStore } from "../model/RemindersProvider";
import type { RemindersStore } from "../model/RemindersStore";
import { REMINDER_LEADS, type ReminderSettings } from "../model/types";

const LEAD_KEYS: Record<number, MessageKey> = {
  0: "reminders.lead.none",
  10: "reminders.lead.10",
  60: "reminders.lead.60",
  180: "reminders.lead.180",
  1440: "reminders.lead.1440",
};

const STARTUP_ANCHOR = "settings-startup";

/** Settings card for reminders; shares the shell store when one is mounted. */
export const RemindersSettings = observer(function RemindersSettings({
  store: provided,
}: {
  store?: RemindersStore;
}) {
  const contextStore = useRemindersStore();
  const store = provided ?? contextStore;
  const { t } = useI18n();
  const settings = store.settings;

  useEffect(() => {
    void store.load();
  }, [store]);

  const update = (patch: Partial<ReminderSettings>): void => {
    void store.save(patch);
  };

  return (
    <Card id="settings-reminders">
      <div className="card-header">
        <div>
          <h3>{t("reminders.title")}</h3>
          <p className="muted small">{t("reminders.subtitle")}</p>
        </div>
      </div>

      {store.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={store.dismissError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{store.error}</span>
        </Notice>
      ) : null}

      {store.permission === "denied" ? (
        <Notice variant="warning">
          <span>{t("reminders.permissionDenied")}</span>
        </Notice>
      ) : null}

      {!settings ? (
        <Loading label={t("reminders.loading")} />
      ) : (
        <>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.remindersEnabled}
              disabled={store.saving}
              onChange={(event) =>
                update({ remindersEnabled: event.target.checked })
              }
            />
            <span>
              <strong>{t("reminders.enabled")}</strong>
              <small>{t("reminders.enabledHint")}</small>
            </span>
          </label>

          <Field
            id="reminders-lead"
            label={t("reminders.defaultLead")}
            hint={t("reminders.defaultLeadHint")}
          >
            <Select
              id="reminders-lead"
              value={String(settings.defaultLeadMinutes)}
              disabled={store.saving}
              aria-describedby="reminders-lead-hint"
              onChange={(event) =>
                update({ defaultLeadMinutes: Number(event.target.value) })
              }
            >
              {REMINDER_LEADS.map((lead) => (
                <option key={lead} value={lead}>
                  {t(LEAD_KEYS[lead] ?? "reminders.lead.none")}
                </option>
              ))}
            </Select>
          </Field>

          <FormRow>
            <Field
              id="reminders-quiet-start"
              label={t("reminders.quietStart")}
              hint={t("reminders.quietHoursHint")}
            >
              <Input
                id="reminders-quiet-start"
                type="time"
                value={settings.quietHoursStart}
                disabled={store.saving}
                aria-describedby="reminders-quiet-start-hint"
                onChange={(event) =>
                  update({ quietHoursStart: event.target.value })
                }
              />
            </Field>
            <Field
              id="reminders-quiet-end"
              label={t("reminders.quietEnd")}
            >
              <Input
                id="reminders-quiet-end"
                type="time"
                value={settings.quietHoursEnd}
                disabled={store.saving}
                onChange={(event) =>
                  update({ quietHoursEnd: event.target.value })
                }
              />
            </Field>
          </FormRow>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.notifySound}
              disabled={store.saving}
              onChange={(event) =>
                update({ notifySound: event.target.checked })
              }
            />
            <span>
              <strong>{t("reminders.sound")}</strong>
              <small>{t("reminders.soundHint")}</small>
            </span>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.hideTitles}
              disabled={store.saving}
              onChange={(event) =>
                update({ hideTitles: event.target.checked })
              }
            />
            <span>
              <strong>{t("reminders.hideTitles")}</strong>
              <small>{t("reminders.hideTitlesHint")}</small>
            </span>
          </label>

          <div className="reminders-test">
            <Button
              variant="secondary"
              loading={store.testing}
              onClick={() => void store.testNotification()}
            >
              {store.testing ? t("reminders.testing") : t("reminders.test")}
            </Button>
            {store.testResult === "ok" ? (
              <span className="muted small" role="status">
                {t("reminders.testOk")}
              </span>
            ) : null}
            {store.testResult === "denied" ? (
              <span className="muted small" role="status">
                {t("reminders.testDenied")}
              </span>
            ) : null}
          </div>

          <p className="muted small">
            {t("reminders.autostartHint")}{" "}
            <Button
              variant="link"
              onClick={() => {
                document
                  .getElementById(STARTUP_ANCHOR)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {t("reminders.autostartLink")}
            </Button>
          </p>
        </>
      )}
    </Card>
  );
});
