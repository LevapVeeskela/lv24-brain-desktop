import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type PropsWithChildren,
} from "react";
import {
  applyDocumentLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
} from "./index";

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale,
  onLocaleChange,
  children,
}: PropsWithChildren<{
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}>) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale: onLocaleChange,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, onLocaleChange],
  );

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}
