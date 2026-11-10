import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { parseOAuthCallback } from "@/features/oauth-callback/model/callback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";

export const OAuthCallbackCard = observer(function OAuthCallbackCard({
  engine,
}: {
  engine: EngineStore;
}) {
  const { t } = useI18n();
  if (!engine.oauthCallback) {
    return null;
  }

  // This card only presents the received deep link. Forwarding the
  // authorization code to the engine is still a documented gap; the callback
  // itself is never rendered and the code is never placed in the DOM.
  const callback = parseOAuthCallback(engine.oauthCallback);

  return (
    <Card className="deep-link">
      <h3>{t("oauth.title")}</h3>
      <Notice
        variant={callback.ok ? "info" : "error"}
        action={
          <Button variant="link" onClick={engine.dismissOAuthCallback}>
            {t("actions.dismiss")}
          </Button>
        }
      >
        <span>
          {callback.ok
            ? t("oauth.received", { scheme: engine.deepLinkScheme })
            : t("oauth.callbackError")}
        </span>
        {!callback.ok && callback.error ? (
          <p className="muted small">
            {t("common.error")}: <code>{callback.error}</code>
            {callback.errorDescription
              ? ` — ${callback.errorDescription}`
              : ""}
          </p>
        ) : !callback.ok && callback.errorDescription ? (
          <p className="muted small">{callback.errorDescription}</p>
        ) : null}
      </Notice>
      {callback.connectionId ? (
        <p className="muted small">
          {t("common.id")}: <code>{callback.connectionId}</code>
        </p>
      ) : null}
      <div className="page-actions">
        <Link
          className="btn btn-secondary"
          to={
            callback.connectionId
              ? `/connections/${encodeURIComponent(callback.connectionId)}`
              : "/connections"
          }
        >
          {callback.connectionId
            ? t("connections.open")
            : t("detail.back")}
        </Link>
      </div>
      <p className="muted small">{t("oauth.callbackRedacted")}</p>
    </Card>
  );
});
