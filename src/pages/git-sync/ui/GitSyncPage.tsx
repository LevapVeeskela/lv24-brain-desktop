import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import type { GitSyncStore } from "@/entities/git-sync/model/GitSyncStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { useI18n } from "@/shared/i18n";

export const GitSyncPage = observer(function GitSyncPage({
  gitSync,
}: {
  gitSync: GitSyncStore;
}) {
  const { t } = useI18n();
  const status = gitSync.status;

  useEffect(() => {
    void gitSync.load();
  }, [gitSync]);

  const busy = gitSync.loading || gitSync.syncing;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("gitSync.title")}</h2>
          <p className="muted">{t("gitSync.subtitle")}</p>
        </div>
        <div className="row-actions">
          <Button
            disabled={busy}
            onClick={() => void gitSync.load(true)}
          >
            {gitSync.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void gitSync.sync(true)}
          >
            {gitSync.syncing ? t("gitSync.syncing") : t("gitSync.syncNow")}
          </Button>
        </div>
      </div>

      {gitSync.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" disabled={busy} onClick={() => void gitSync.load(true)}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{gitSync.error}</span>
        </Notice>
      ) : null}

      {!gitSync.loaded && !gitSync.error ? (
        <Card>
          <Loading label={`${t("common.loading")} ${t("gitSync.title")}`} />
        </Card>
      ) : status ? (
        <>
          <div className="grid">
            <Card>
              <h3>{t("gitSync.repository")}</h3>
              <dl className="details">
                <dt>{t("gitSync.branch")}</dt>
                <dd><code>{status.branch || t("common.none")}</code></dd>
                <dt>{t("gitSync.ahead")}</dt>
                <dd>{status.ahead}</dd>
                <dt>{t("gitSync.behind")}</dt>
                <dd>{status.behind}</dd>
                <dt>{t("gitSync.workingTree")}</dt>
                <dd>{status.dirty ? t("gitSync.dirty") : t("gitSync.clean")}</dd>
              </dl>
            </Card>
            <Card>
              <h3>{t("gitSync.lastSync")}</h3>
              {status.lastSynced ? (
                <dl className="details">
                  <dt>{t("gitSync.revision")}</dt>
                  <dd><code>{status.lastSynced.value}</code></dd>
                  <dt>{t("gitSync.at")}</dt>
                  <dd>{status.lastSynced.at}</dd>
                </dl>
              ) : (
                <p className="muted">{t("gitSync.never")}</p>
              )}
            </Card>
          </div>

          <Card>
            <h3>{t("gitSync.conflicts")}</h3>
            {gitSync.hasConflicts ? (
              <>
                <Notice variant="error">
                  <span>{t("gitSync.conflictHint")}</span>
                </Notice>
                <ul className="plain-list">
                  {status.conflicts.map((path) => (
                    <li key={path}><code>{path}</code></li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">{t("gitSync.noConflicts")}</p>
            )}
            {status.conflictRecords.length > 0 ? (
              <>
                <h4>{t("gitSync.conflictRecords")}</h4>
                <ul className="plain-list">
                  {status.conflictRecords.map((path) => (
                    <li key={path}><code>{path}</code></li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
});
