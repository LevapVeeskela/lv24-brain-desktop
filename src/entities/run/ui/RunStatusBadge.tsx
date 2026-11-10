import type { Run } from "@/entities/connection/model/types";
import { useI18n } from "@/shared/i18n";
import { runDisplayStatus } from "../model/presentation";

export function RunStatusBadge({ run }: { run: Run }) {
  const { t } = useI18n();
  const status = runDisplayStatus(run);
  return <span className={`run-status run-${status}`}>{t(`runStatus.${status}`)}</span>;
}
