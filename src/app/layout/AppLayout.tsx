import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { AppHeader } from "@/widgets/app-header/ui/AppHeader";
import { AppNav } from "@/widgets/app-nav/ui/AppNav";
import { OAuthCallbackCard } from "@/features/oauth-callback/ui/OAuthCallbackCard";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Notice } from "@/shared/ui/Notice";
import { useI18n, type MessageKey } from "@/shared/i18n";

function routeTitleKey(pathname: string): MessageKey {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "nav.dashboard";
  }
  if (segments.length === 1) {
    switch (segments[0]) {
      case "connections":
        return "nav.connections";
      case "activity":
        return "nav.activity";
      case "projects":
        return "nav.projects";
      case "settings":
        return "nav.settings";
      default:
        return "app.notFound";
    }
  }
  if (segments[0] === "connections" && segments.length === 2) {
    return "nav.connections";
  }
  return "app.notFound";
}

export const AppLayout = observer(function AppLayout({
  store,
}: {
  store: RootStore;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const engine = store.engine;
  const mainRef = useRef<HTMLElement>(null);
  const previousPathname = useRef(location.pathname);
  const [quitOpen, setQuitOpen] = useState(false);
  const quitting = engine.busy === "quit";
  const quitDisabled =
    engine.busy !== null ||
    engine.isUpdating ||
    Boolean(store.settings?.installingUpdate);

  useEffect(() => {
    document.title = `${t(routeTitleKey(location.pathname))} · ${t("app.title")}`;
  }, [location.pathname, t]);

  useEffect(() => {
    if (previousPathname.current === location.pathname) {
      return;
    }
    previousPathname.current = location.pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    mainRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="shell">
      {/* HashRouter would treat "#…" as a route, so focus the target directly. */}
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {t("app.skipToContent")}
      </a>
      <AppHeader engine={engine} />
      <AppNav />
      <main
        id="main-content"
        className="content"
        tabIndex={-1}
        ref={mainRef}
      >
        {engine.sessionRecoveryNoticeVisible ? (
          <Notice
            variant="info"
            action={
              <Button
                variant="link"
                onClick={engine.dismissSessionRecoveryNotice}
              >
                {t("actions.dismiss")}
              </Button>
            }
          >
            <strong>{t("session.recoveryTitle")}</strong>
            <span>
              {engine.sessionDiagnosticsAvailable
                ? t("session.recoveryDetail", {
                    logDir: engine.logDir ?? t("paths.notResolved"),
                  })
                : t("session.recoveryUnavailable")}
            </span>
          </Notice>
        ) : null}
        <Outlet />
        <OAuthCallbackCard engine={engine} />
      </main>
      <footer className="footer">
        <span aria-live="polite">
          {t("footer.desktop", { version: engine.desktopVersion })}
          {engine.version && <> · {t("footer.engine", { version: engine.version })}</>}
        </span>
        <Button
          variant="link"
          disabled={quitDisabled}
          onClick={() => setQuitOpen(true)}
        >
          {quitting ? t("actions.quitting") : t("actions.quit")}
        </Button>
      </footer>
      <ConfirmDialog
        open={quitOpen}
        title={t("actions.quit")}
        confirmLabel={quitting ? t("actions.quitting") : t("actions.quit")}
        cancelLabel={t("common.cancel")}
        danger
        busy={quitting}
        onConfirm={() => {
          setQuitOpen(false);
          void engine.quit();
        }}
        onCancel={() => setQuitOpen(false)}
      >
        <p>{t("footer.quitConfirm")}</p>
      </ConfirmDialog>
    </div>
  );
});
