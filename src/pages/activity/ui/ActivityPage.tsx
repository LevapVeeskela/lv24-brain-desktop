import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import { useI18n } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";

export const ActivityPage = observer(function ActivityPage({
  runs,
}: {
  runs: RunsStore;
}) {
  const { t, locale } = useI18n();

  useEffect(() => {
    void runs.load(true);
    void runs.resetLog();
  }, [runs]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("activity.title")}</h2>
          <p className="muted">{t("activity.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          disabled={runs.loading}
          onClick={() => void runs.load(true)}
        >
          {runs.loading ? t("common.loading") : t("actions.refresh")}
        </Button>
      </div>

      {runs.error ? (
        <p className="inline-error">{runs.error}</p>
      ) : null}

      <Card>
        {runs.items.length === 0 ? (
          <div className="empty-state">
            <strong>{t("activity.empty")}</strong>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.started")}</th>
                  <th>{t("activity.connection")}</th>
                  <th>{t("activity.source")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("activity.counts")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.items.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.startedAt, locale)}</td>
                    <td>
                      {run.connectionId ? (
                        <Link
                          className="table-link"
                          to={`/connections/${encodeURIComponent(run.connectionId)}`}
                        >
                          {run.connectionId}
                        </Link>
                      ) : (
                        t("common.none")
                      )}
                    </td>
                    <td>{run.source}</td>
                    <td>
                      <span className={`run-status run-${run.status}`}>
                        {t(`runStatus.${run.status}`)}
                      </span>
                    </td>
                    <td>
                      {run.stats
                        ? `${run.stats.upserted}/${run.stats.seen}`
                        : (run.counts?.items ?? t("common.none"))}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        className="btn-small"
                        onClick={() => void runs.openLog(run.id)}
                      >
                        {t("activity.log")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
      </Card>
    </div>
  );
});
