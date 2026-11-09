import { en, type MessageKey, type MessageParams } from "./messages/en";
import { ru } from "./messages/ru";
import { zh } from "./messages/zh";

export const LOCALES = ["en", "ru", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "lv24.locale";

export const dictionaries = { en, ru, zh } satisfies Record<Locale, object>;

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ru" || value === "zh";
}

/** Map a BCP-47 tag such as ru-RU or zh-Hans-CN to one of our locales. */
export function normalizeLocale(tag: string | null | undefined): Locale | null {
  if (!tag) {
    return null;
  }
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: MessageParams,
): string {
  const template = dictionaries[locale][key] ?? en[key];
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

type LocaleStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LocaleStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function browserLanguage(): string | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.languages?.[0] ?? navigator.language;
}

export function detectLocale(
  storage: LocaleStorage | null = browserStorage(),
  language: string | undefined = browserLanguage(),
): Locale {
  try {
    const stored = normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
    if (stored) {
      return stored;
    }
  } catch {
    // A locked-down storage backend must not break the UI.
  }
  return normalizeLocale(language) ?? DEFAULT_LOCALE;
}

export function persistLocale(
  locale: Locale,
  storage: LocaleStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The UI still switches for this session.
  }
}

export function applyDocumentLocale(locale: Locale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export type { MessageKey, MessageParams };

export { I18nProvider, useI18n } from "./I18nProvider";
export type { I18nValue } from "./I18nProvider";
