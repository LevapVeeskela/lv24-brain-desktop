import { observer } from "mobx-react-lite";
import { Outlet } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { AppHeader } from "@/widgets/app-header/ui/AppHeader";
import { AppNav } from "@/widgets/app-nav/ui/AppNav";
import { OAuthCallbackCard } from "@/features/oauth-callback/ui/OAuthCallbackCard";
import { Button } from "@/shared/ui/Button";
import { useI18n } from "@/shared/i18n";

export const AppLayout = observer(function AppLayout({
  store,
}: {
  store: RootStore;
}) {
  const { t } = useI18n();
  const engine = store.engine;
  return (
    <div className="shell">
      <AppHeader engine={engine} />
      <AppNav />
      <main className="content">
        <Outlet />
        <OAuthCallbackCard engine={engine} />
      </main>
      <footer className="footer">
        <span>
          {t("footer.desktop", { version: engine.desktopVersion })} ·{" "}
          {engine.version
            ? t("footer.engine", { version: engine.version })
            : t("footer.engineOffline")}
        </span>
        <Button
          variant="link"
          disabled={engine.busy !== null}
          onClick={() => void engine.quit()}
        >
          {t("actions.quit")}
        </Button>
      </footer>
    </div>
  );
});
