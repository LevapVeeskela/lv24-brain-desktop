import { LOCALES, useI18n } from "@/shared/i18n";

const labels: Record<(typeof LOCALES)[number], string> = {
  en: "EN",
  ru: "RU",
  zh: "中文",
};

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="locale-switch" role="group" aria-label={t("app.localeLabel")}>
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          className={`locale-option ${item === locale ? "active" : ""}`}
          aria-pressed={item === locale}
          onClick={() => setLocale(item)}
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
