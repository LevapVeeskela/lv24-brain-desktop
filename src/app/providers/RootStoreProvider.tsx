import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { RootStore } from "../model/RootStore";

const RootStoreContext = createContext<RootStore | null>(null);

export function RootStoreProvider({ children }: PropsWithChildren) {
  const [store] = useState(() => new RootStore());

  useEffect(() => {
    store.start();
    return () => store.dispose();
  }, [store]);

  return (
    <RootStoreContext.Provider value={store}>
      {children}
    </RootStoreContext.Provider>
  );
}

export function useRootStore(): RootStore {
  const store = useContext(RootStoreContext);
  if (!store) {
    throw new Error("useRootStore must be used inside RootStoreProvider");
  }
  return store;
}
