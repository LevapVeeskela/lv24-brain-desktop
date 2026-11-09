import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
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
  return (
    <Card className="deep-link">
      <h3>{t("oauth.title")}</h3>
      <p className="muted small">
        {t("oauth.received", { scheme: engine.deepLinkScheme })}
      </p>
      <code className="callback">{engine.oauthCallback}</code>
      <div>
        <Button variant="link" onClick={engine.dismissOAuthCallback}>
          {t("actions.dismiss")}
        </Button>
      </div>
    </Card>
  );
});
