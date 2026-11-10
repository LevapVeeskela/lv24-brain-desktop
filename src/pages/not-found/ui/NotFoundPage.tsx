import { Link } from "react-router-dom";
import { useI18n } from "@/shared/i18n";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <section className="page" aria-labelledby="not-found-title">
      <div className="page-header">
        <div>
          <h2 id="not-found-title">{t("app.notFound")}</h2>
          <p className="muted">{t("app.notFoundHint")}</p>
        </div>
      </div>
      <div>
        <Link className="text-link" to="/">
          {t("nav.dashboard")}
        </Link>
      </div>
    </section>
  );
}
