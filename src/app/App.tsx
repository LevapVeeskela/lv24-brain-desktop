import { observer } from "mobx-react-lite";
import { DashboardPage } from "@/pages/dashboard";
import { I18nProvider } from "@/shared/i18n/I18nProvider";
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
      <DashboardPage
        engine={store.engine}
        connections={store.connections}
        sync={store.sync}
        settings={store.settings}
      />
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
