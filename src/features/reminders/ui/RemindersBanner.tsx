import { observer } from "mobx-react-lite";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";
import { useRemindersStore } from "../model/RemindersProvider";
import type { RemindersStore } from "../model/RemindersStore";

/**
 * Compact launch/missed digest and the in-app fallback for a blocked toast.
 * Rendered once in AppLayout, above the routed page.
 */
export const RemindersBanner = observer(function RemindersBanner({
  store,
}: {
  store: RemindersStore;
}) {
  const { t } = useI18n();
  const missed = store.missed;
  const fallbacks = store.fallbacks;

  if (!missed && fallbacks.length === 0) {
    return null;
  }

  return (
    <div className="reminders-banners">
      {missed ? (
        <Notice
          variant="info"
          action={
            <div className="reminders-actions">
              <Button variant="link" onClick={store.openIdeas}>
                {t("reminders.viewIdeas")}
              </Button>
              <Button variant="link" onClick={store.dismissMissed}>
                {t("actions.dismiss")}
              </Button>
            </div>
          }
        >
          <strong>{t("reminders.missedTitle")}</strong>
          <span>
            {t(
              missed.count === 1 ? "reminders.missedOne" : "reminders.missedMany",
              { count: missed.count },
            )}
          </span>
        </Notice>
      ) : null}
      {fallbacks.map((fallback, index) => (
        <Notice
          key={`${fallback.ideaId ?? "unknown"}-${fallback.trigger}-${index}`}
          variant="warning"
          action={
            <div className="reminders-actions">
              <Button
                variant="link"
                onClick={() => store.focus(fallback.ideaId)}
              >
                {t("reminders.fallbackOpen")}
              </Button>
              <Button
                variant="link"
                onClick={() => store.dismissFallback(index)}
              >
                {t("actions.dismiss")}
              </Button>
            </div>
          }
        >
          <strong>{t("reminders.fallbackTitle")}</strong>
          <span>{fallback.title ?? t("reminders.fallbackBody")}</span>
        </Notice>
      ))}
    </div>
  );
});

/** The banner wired to the shell's shared store. */
export function RemindersSurface() {
  const store = useRemindersStore();
  return <RemindersBanner store={store} />;
}
