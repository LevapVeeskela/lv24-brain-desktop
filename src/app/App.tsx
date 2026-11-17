import { Component, type ErrorInfo, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { AppRouter } from "./routing/AppRouter";
import {
  I18nProvider,
  useI18n,
} from "@/shared/i18n/I18nProvider";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Notice";
import { FeedbackProvider } from "@/shared/ui/Feedback";
import {
  RootStoreProvider,
  useRootStore,
} from "./providers/RootStoreProvider";

interface RouterErrorBoundaryState {
  error: Error | null;
}

/**
 * A render throw inside a route would otherwise leave an empty webview. Keep a
 * readable message with a retry and a full reload instead.
 */
class RouterErrorBoundary extends Component<
  { children: ReactNode },
  RouterErrorBoundaryState
> {
  state: RouterErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): RouterErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Route render failed", error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return <RouterErrorFallback error={error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

function RouterErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="page-header">
        <h2>{t("errors.generic")}</h2>
      </div>
      <Notice variant="error">
        <span>{error.message || error.name}</span>
      </Notice>
      <div className="form-actions">
        <Button variant="primary" onClick={onRetry}>
          {t("actions.retry")}
        </Button>
        <Button onClick={() => window.location.reload()}>
          {t("actions.reload")}
        </Button>
      </div>
    </div>
  );
}

const AppShell = observer(function AppShell() {
  const store = useRootStore();
  return (
    <I18nProvider
      locale={store.settings.locale}
      onLocaleChange={store.settings.setLocale}
    >
      <FeedbackProvider>
        <RouterErrorBoundary>
          <AppRouter store={store} />
        </RouterErrorBoundary>
      </FeedbackProvider>
    </I18nProvider>
  );
});

export function App() {
  return (
    <RootStoreProvider>
      <AppShell />
    </RootStoreProvider>
  );
}
