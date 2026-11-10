import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Table } from "@/shared/ui/Table";
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
    return () => { void runs.resetLog(); };
  }, [runs]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("activity.title")}</h2>
          <p className="muted">{t("activity.subtitle")}</p>
        </div>
        <Button
          variant="primary"
          disabled={runs.loading}
          onClick={() => void runs.load(true)}
        >
          {runs.loading ? t("common.loading") : t("actions.refresh")}
        </Button>
      </div>

      {runs.error ? <Notice variant="error" action={<Button variant="link" disabled={runs.loading} onClick={() => void runs.load(true)}>{t("actions.retry")}</Button>}><span>{runs.error}</span></Notice> : null}

      <Card>
        {!runs.loaded && !runs.error ? (
          <Loading label={`${t("common.loading")} ${t("activity.title")}`} />
        ) : runs.loaded && runs.items.length === 0 ? (
          <EmptyState title={t("activity.empty")} hint={t("activity.subtitle")} action={<Link className="text-link" to="/connections">{t("nav.connections")}</Link>} />
        ) : runs.items.length > 0 ? (
            <Table caption={t("activity.subtitle")}>
              <thead>
                <tr>
                  <th scope="col">{t("common.started")}</th>
                  <th scope="col">{t("activity.connection")}</th>
                  <th scope="col">{t("activity.source")}</th>
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">{t("activity.counts")}</th>
                  <th scope="col">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.items.map((run) => (
                  <tr key={run.id}>
                    <td data-label={t("common.started")}><time dateTime={run.startedAt}>{formatDateTime(run.startedAt, locale)}</time></td>
                    <td data-label={t("activity.connection")}>
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
                    <td data-label={t("activity.source")}>{run.source}</td>
                    <td data-label={t("common.status")}>
                      <span className={`run-status run-${run.status}`}>
                        {t(`runStatus.${run.status}`)}
                      </span>
                    </td>
                    <td data-label={t("activity.counts")}>
                      {run.stats
                        ? `${run.stats.upserted}/${run.stats.seen}`
                        : (run.counts?.items ?? t("common.none"))}
                    </td>
                    <td data-label={t("common.actions")}>
                      <Button
                        variant="secondary"
                        className="btn-small"
                        aria-label={`${t("activity.log")}: ${run.id}`}
                        onClick={() => void runs.openLog(run.id)}
                      >
                        {t("activity.log")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
        ) : null}
        {runs.items.length > 0 ? <p className="muted small">{t("activity.historyNote")}</p> : null}
      </Card>
      {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
    </div>
  );
});
