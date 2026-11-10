import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useI18n } from "@/shared/i18n";
import { useFeedback } from "@/shared/ui/Feedback";

const NEAR_BOTTOM_PX = 32;

export const RunLogPanel = observer(function RunLogPanel({
  runs,
}: {
  runs: RunsStore;
}) {
  const { t } = useI18n();
  const { notify } = useFeedback();
  const preRef = useRef<HTMLPreElement>(null);
  const [following, setFollowing] = useState(true);
  const [closed, setClosed] = useState(false);
  const runId = runs.selectedRunId;
  const lastLog = runs.logs[runs.logs.length - 1];
  const logText = runs.logs.map((line) => line.event && line.event !== "message" ? `[${line.event}] ${line.data}` : line.data).join("\n");

  const copyLog = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logText);
      notify(t("log.copied"), "success");
    } catch {
      notify(t("log.copyFailed"), "error");
    }
  };

  const saveLog = (): void => {
    const url = URL.createObjectURL(new Blob([logText], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(runId ?? "run").replace(/[^a-zA-Z0-9_-]/g, "_")}.log`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

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
          <Button variant="ghost" disabled={!logText} onClick={() => void copyLog()}>{t("log.copy")}</Button>
          <Button variant="ghost" disabled={!logText} onClick={saveLog}>{t("log.save")}</Button>
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
        <div className="inline-error" role="alert">
          {runs.logError}
          <Button variant="link" disabled={runs.streaming || !runId} onClick={() => { if (runId) void runs.openLog(runId); }}>{t("actions.retry")}</Button>
        </div>
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
          aria-live={following ? "polite" : "off"}
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
            <span key={line.id} className={`log-line ${/error|stderr|fatal/i.test(line.event) ? "log-line-error" : /warn/i.test(line.event) ? "log-line-warning" : ""}`}>
              {line.event && line.event !== "message" ? <span className="log-event">[{line.event}] </span> : null}{line.data}
            </span>
          ))}
        </pre>
      )}
      <div className="muted small" role="status" aria-live="polite">
        {!runs.streaming && runId && !closed && !runs.logError
          ? t("log.finishedStatus")
          : null}
      </div>
      <p className="muted small">{t("log.windowNote")} {t("log.sourceNote")}</p>
    </Card>
  );
});
