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
 * Mounts one reminder store for the whole shell: subscribes to scheduler
 * events and keeps the missed-digest banner in sync.
 */
export function RemindersProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new RemindersStore());

  useEffect(() => {
    void store.start();
    return () => store.dispose();
  }, [store]);

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
