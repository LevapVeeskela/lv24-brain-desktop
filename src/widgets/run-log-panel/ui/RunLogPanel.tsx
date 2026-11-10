import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";

const NEAR_BOTTOM_PX = 32;

export const RunLogPanel = observer(function RunLogPanel({
  runs,
}: {
  runs: RunsStore;
}) {
  const { t } = useI18n();
  const preRef = useRef<HTMLPreElement>(null);
  const [following, setFollowing] = useState(true);
  const [closed, setClosed] = useState(false);
  const runId = runs.selectedRunId;
  const lastLog = runs.logs[runs.logs.length - 1];

  useEffect(() => {
    setFollowing(true);
    setClosed(false);
  }, [runId]);

  useEffect(() => {
    if (runs.streaming) {
      setFollowing(true);
      setClosed(false);
    }
  }, [runs.streaming]);

  useEffect(() => {
    if (!following) {
      return;
    }
    const node = preRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [following, lastLog]);

  const isNearBottom = (node: HTMLPreElement): boolean =>
    node.scrollHeight - node.scrollTop - node.clientHeight <= NEAR_BOTTOM_PX;

  return (
    <Card className="log-panel">
      <div className="card-header">
        <div>
          <h3>{t("activity.log")}</h3>
          <p className="muted small">
            {runId ?? ""} {runs.streaming ? `· ${t("log.streaming")}` : ""}
          </p>
        </div>
        <div className="row-actions">
          <Button
            variant="secondary"
            aria-pressed={following}
            onClick={() => setFollowing((current) => !current)}
          >
            {following ? t("log.stopFollowing") : t("log.follow")}
          </Button>
          {runs.streaming ? (
            <Button
              variant="secondary"
              onClick={() => {
                setClosed(true);
                void runs.closeLog();
              }}
            >
              {t("detail.stopLog")}
            </Button>
          ) : null}
        </div>
      </div>
      {runs.logError ? (
        <p className="inline-error" role="alert">
          {runs.logError}
        </p>
      ) : null}
      {runs.logs.length === 0 ? (
        <p className="muted small">
          {runs.streaming ? t("detail.logEmpty") : t("common.none")}
        </p>
      ) : (
        <pre
          className="log-output"
          ref={preRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={runId ? `${t("activity.log")}: ${runId}` : t("activity.log")}
          tabIndex={0}
          onScroll={(event) => {
            if (following && !isNearBottom(event.currentTarget)) {
              setFollowing(false);
            }
          }}
        >
          {runs.logs.map((line) => (
            <span key={line.id} className="log-line">
              {line.event && line.event !== "message"
                ? `[${line.event}] ${line.data}`
                : line.data}
            </span>
          ))}
        </pre>
      )}
      <div className="muted small" role="status" aria-live="polite">
        {!runs.streaming && runId && !closed && !runs.logError
          ? t("log.finishedStatus")
          : null}
      </div>
    </Card>
  );
});
