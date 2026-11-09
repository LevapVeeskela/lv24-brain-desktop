import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

export const RunLogPanel = observer(function RunLogPanel({
  runs,
}: {
  runs: RunsStore;
}) {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = preRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [runs.logs.length]);

  return (
    <Card className="log-panel">
      <div className="card-header">
        <div>
          <h3>{t("activity.log")}</h3>
          <p className="muted small">
            {runs.selectedRunId ?? ""}{" "}
            {runs.streaming ? `· ${t("log.streaming")}` : ""}
          </p>
        </div>
        {runs.streaming ? (
          <Button variant="secondary" onClick={() => void runs.closeLog()}>
            {t("detail.stopLog")}
          </Button>
        ) : null}
      </div>
      {runs.logError ? (
        <p className="inline-error">{runs.logError}</p>
      ) : null}
      {runs.logs.length === 0 ? (
        <p className="muted small">
          {runs.streaming ? t("detail.logEmpty") : t("common.none")}
        </p>
      ) : (
        <pre className="log-output" ref={preRef}>
          {runs.logs
            .map((line) =>
              line.event && line.event !== "message"
                ? `[${line.event}] ${line.data}`
                : line.data,
            )
            .join("\n")}
        </pre>
      )}
    </Card>
  );
});
