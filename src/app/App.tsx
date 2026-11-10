import { observer } from "mobx-react-lite";
import { AppRouter } from "./routing/AppRouter";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
import { FeedbackProvider } from "@/shared/ui/Feedback";
import {
  RootStoreProvider,
  useRootStore,
} from "./providers/RootStoreProvider";

const AppShell = observer(function AppShell() {
  const store = useRootStore();
  return (
    <I18nProvider
      locale={store.settings.locale}
      onLocaleChange={store.settings.setLocale}
    >
      <FeedbackProvider><AppRouter store={store} /></FeedbackProvider>
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
