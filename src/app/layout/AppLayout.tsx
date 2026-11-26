import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { AppHeader } from "@/widgets/app-header/ui/AppHeader";
import { AppRail } from "@/widgets/app-rail/ui/AppRail";
import { CommandPalette } from "@/features/command-palette/ui/CommandPalette";
import { OAuthCallbackCard } from "@/features/oauth-callback/ui/OAuthCallbackCard";
import { RemindersProvider } from "@/features/reminders/model/RemindersProvider";
import { RemindersSurface } from "@/features/reminders/ui/RemindersBanner";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Notice } from "@/shared/ui/Notice";
import { tauriInvoke } from "@/shared/api/tauri";
import { useI18n, type MessageKey } from "@/shared/i18n";

// docsUrl points at the localized documentation site.
function docsUrl(locale: string): string {
  if (locale === "ru") {
    return "https://brain.lv24.by/ru/";
  }
  if (locale === "zh") {
    return "https://brain.lv24.by/zh/";
  }
  return "https://brain.lv24.by/";
}

/** Section titles for the app bar and window title, keyed by the first path segment. */
export function routeTitleKey(pathname: string): MessageKey {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "nav.dashboard";
  }
  switch (segments[0]) {
    case "connections":
      return "nav.connections";
    case "activity":
      return "nav.activity";
    case "ideas":
      return "nav.ideas";
    case "projects":
      return "nav.projects";
    case "settings":
      return "nav.settings";
    case "sync":
      return "nav.gitSync";
    case "memory":
      return "nav.memory";
    case "inbox":
      return "nav.inbox";
    case "quarantine":
      return "quarantine.title";
    case "search":
      return "nav.search";
    default:
      return "app.notFound";
  }
}

export const AppLayout = observer(function AppLayout({
  store,
}: {
  store: RootStore;
}) {
  const { t, locale } = useI18n();
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
      <AppRail store={store} />
      <div className="shell-main">
        <AppHeader engine={engine} section={routeTitleKey(location.pathname)} />
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
          <RemindersProvider>
            <RemindersSurface />
            <Outlet />
          </RemindersProvider>
          <OAuthCallbackCard engine={engine} />
          <footer className="footer">
            <span aria-live="polite">
              {t("footer.desktop", { version: engine.desktopVersion })}
              {engine.version && <> · {t("footer.engine", { version: engine.version })}</>}
            </span>
            <div className="footer-actions">
              <Button
                variant="link"
                onClick={() => {
                  void tauriInvoke("open_external", { url: docsUrl(locale) }).catch(
                    () => undefined,
                  );
                }}
              >
                {t("footer.docs")}
              </Button>
              <Button
                variant="link"
                disabled={quitDisabled}
                onClick={() => setQuitOpen(true)}
              >
                {quitting ? t("actions.quitting") : t("actions.quit")}
              </Button>
            </div>
          </footer>
        </main>
      </div>
      <CommandPalette
        search={store.commandSearch}
        projects={store.projects}
        engine={store.engine}
      />
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
