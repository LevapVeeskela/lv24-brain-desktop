import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "@/shared/i18n";
import { FeedbackProvider } from "@/shared/ui/Feedback";

export function renderPage(
  node: ReactNode,
  locale: "en" | "ru" | "zh" = "en",
  initialEntries?: string[],
): string {
  return renderToStaticMarkup(
    <I18nProvider locale={locale} onLocaleChange={() => undefined}>
      <FeedbackProvider>
        <MemoryRouter initialEntries={initialEntries}>{node}</MemoryRouter>
      </FeedbackProvider>
    </I18nProvider>,
  );
}
