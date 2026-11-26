import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { IdeasStore } from "@/pages/ideas/model/IdeasStore";
import { dueChip } from "@/pages/ideas/model/format";
import { dueChipText } from "@/pages/ideas/ui/labels";
import { useI18n } from "@/shared/i18n";
import { Card } from "@/shared/ui/Card";

/** Compact dashboard card: overdue and today, at most three rows. */
export const IdeasTodayCard = observer(function IdeasTodayCard({
  ideas,
}: {
  ideas: IdeasStore;
}) {
  const { t, locale } = useI18n();
  const now = ideas.nowDate();
  const preview = ideas.todayPreview;

  return (
    <Card className="dashboard-ideas">
      <div className="card-header">
        <div>
          <h3>{t("ideas.todayCard.title")}</h3>
          <p className="muted small">
            {t("ideas.todayCard.open", { count: ideas.openCount })}
          </p>
        </div>
        <Link className="text-link" to="/ideas">
          {t("ideas.todayCard.all")} →
        </Link>
      </div>
      {preview.length > 0 ? (
        <ul className="idea-preview-list">
          {preview.map((idea) => {
            const chip = dueChip(idea, now, locale);
            return (
              <li className="idea-preview-row" key={idea.id}>
                <Link
                  className="table-link"
                  to={`/ideas?focus=${encodeURIComponent(idea.id)}`}
                >
                  {idea.title}
                </Link>
                <span className="idea-chips">
                  {chip ? (
                    <span
                      className={`idea-chip idea-due${chip.kind === "overdue" ? " is-overdue" : ""}`}
                    >
                      {dueChipText(chip, t)}
                    </span>
                  ) : null}
                  <span className="idea-chip idea-project">
                    {idea.projectId}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{t("ideas.todayCard.empty")}</p>
      )}
    </Card>
  );
});
