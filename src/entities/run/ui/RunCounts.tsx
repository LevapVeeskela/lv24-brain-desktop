import type { Run } from "@/entities/connection/model/types";
import { useI18n } from "@/shared/i18n";

/** Item counts are observations, not a completed/total progress fraction. */
export function RunCounts({ run }: { run: Run }) {
  const { t } = useI18n();
  if (!run.stats) return <>{run.counts?.items ?? t("common.none")}</>;
  return <span>
    <span>{t("runStats.seen", { count: run.stats.seen })}</span>
    <span className="table-sub">{t("runStats.upserted", { count: run.stats.upserted })}</span>
  </span>;
}
