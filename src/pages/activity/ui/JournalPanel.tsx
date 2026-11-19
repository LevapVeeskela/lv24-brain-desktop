import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import type { JournalEntry } from "@/entities/memory/model/types";
import { useI18n } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Table } from "@/shared/ui/Table";
import { JOURNAL_MAX_LIMIT, type JournalStore } from "../model/JournalStore";

export function JournalTable({
  items,
  hasMore,
  limit,
  loading = false,
  onLoadMore,
}: {
  items: readonly JournalEntry[];
  hasMore: boolean;
  limit: number;
  loading?: boolean;
  onLoadMore?: () => void;
}) {
  const { t, locale } = useI18n();
  const loadable = hasMore && limit < JOURNAL_MAX_LIMIT && Boolean(onLoadMore);
  return (
    <>
      <p className="muted small">
        {t("activity.journal.subtitle", { limit })}
      </p>
      <Table caption={t("activity.journal.title")}>
        <thead>
          <tr>
            <th scope="col">{t("activity.journal.time")}</th>
            <th scope="col">{t("activity.journal.event")}</th>
            <th scope="col">{t("activity.journal.entry")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry, index) => (
            <tr key={`${entry.time}-${entry.event}-${entry.id ?? index}`}>
              <td data-label={t("activity.journal.time")}>
                <time dateTime={entry.time}>
                  {formatDateTime(entry.time, locale)}
                </time>
              </td>
              <td data-label={t("activity.journal.event")}>
                {entry.event}
              </td>
              <td data-label={t("activity.journal.entry")}>
                {entry.title ?? entry.id ?? t("common.none")}
                {entry.id && entry.title ? (
                  <span className="muted small"> · {entry.id}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {loadable ? (
        <div className="form-actions">
          <Button disabled={loading} onClick={onLoadMore}>
            {loading ? t("common.loading") : t("activity.journal.loadMore")}
          </Button>
        </div>
      ) : null}
    </>
  );
}

export const JournalPanel = observer(function JournalPanel({
  projectId,
  journal,
}: {
  projectId: string | null;
  journal: JournalStore;
}) {
  const { t } = useI18n();

  useEffect(() => {
    void journal.load(projectId);
  }, [journal, projectId]);


  return (
    <Card>
      <h3>{t("activity.journal.title")}</h3>
      {journal.error ? (
        <Notice variant="error">
          <span>{journal.error}</span>
          <span className="muted small"> {t("activity.journal.error")}</span>
        </Notice>
      ) : null}
      {journal.loading && !journal.loaded ? (
        <Loading label={t("activity.journal.title")} />
      ) : journal.loaded && journal.items.length === 0 ? (
        <EmptyState title={t("activity.journal.empty")} />
      ) : journal.items.length > 0 ? (
        <JournalTable
          items={journal.items}
          hasMore={journal.canLoadMore}
          limit={journal.limit}
          loading={journal.loading}
          onLoadMore={() => void journal.loadMore()}
        />
      ) : null}
    </Card>
  );
});
