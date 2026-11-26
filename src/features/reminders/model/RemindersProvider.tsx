import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { RemindersStore } from "./RemindersStore";

const RemindersContext = createContext<RemindersStore | null>(null);

/**
 * Mounts the reminder store for the whole shell: subscribes to scheduler
 * events and keeps the missed-digest banner in sync.
 *
 * `RootStore` owns the app-wide instance (it also feeds the Ideas default
 * lead); pass it in and the provider only publishes it. Without a store the
 * provider creates and owns a local one for standalone screens.
 */
export function RemindersProvider({
  children,
  store: external,
}: PropsWithChildren<{ store?: RemindersStore }>) {
  const [owned] = useState(() => (external ? null : new RemindersStore()));
  const store = external ?? owned;
  if (!store) {
    throw new Error("RemindersProvider has no store");
  }

  useEffect(() => {
    if (!owned) {
      return;
    }
    void owned.start();
    return () => owned.dispose();
  }, [owned]);

  return (
    <RemindersContext.Provider value={store}>
      {children}
    </RemindersContext.Provider>
  );
}

/**
 * The shared store when inside `RemindersProvider`, otherwise a local instance
 * for standalone screens and tests (the Settings page still works on its own).
 */
export function useRemindersStore(): RemindersStore {
  const context = useContext(RemindersContext);
  const [fallback] = useState(() => new RemindersStore());
  return context ?? fallback;
}
