import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link, useParams } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { RecordKindBadge } from "@/entities/memory/ui/MemoryBadges";
import { useI18n } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";

const DETAIL_MAX_TOKENS = 2000;

export const ProposalDetailPage = observer(function ProposalDetailPage({
  review,
  engine,
}: {
  review: ReviewStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const params = useParams<{ project: string; id: string }>();
  const projectId = params.project;
  const proposalId = params.id;
  const preview =
    review.previewId === proposalId && review.previewProjectId === projectId
      ? review.preview
      : null;

  useEffect(() => {
    if (projectId && proposalId && engine.isRunning) {
      void review.loadPreview(projectId, proposalId, DETAIL_MAX_TOKENS);
    }
    return () => review.clearPreview();
  }, [engine.isRunning, proposalId, projectId, review]);

  if (!projectId || !proposalId) {
    return (
      <div className="page">
        <EmptyState
          title={t("inbox.proposalNotFound")}
          action={
            <Link className="text-link" to="/inbox">
              {t("inbox.back")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link className="text-link" to="/inbox">
            ← {t("inbox.back")}
          </Link>
          <h2>{preview?.title ?? t("common.loading")}</h2>
          {preview ? (
            <span className="badge-row">
              <RecordKindBadge kind={preview.kind} />
              <Badge>{preview.status}</Badge>
              <Badge tone="neutral">{preview.projectId}</Badge>
            </span>
          ) : null}
        </div>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {review.previewError ? (
        <Notice variant="error">
          <span>{review.previewError}</span>
        </Notice>
      ) : review.previewLoading && !preview ? (
        <Loading label={t("inbox.preview")} />
      ) : preview ? (
        <Card>
          {preview.bodyTruncated ? (
            <Notice variant="info">
              <span>
                {t("inbox.previewTruncated", {
                  tokens: preview.bodyTokens,
                  max: preview.maxTokens,
                })}
              </span>
            </Notice>
          ) : null}
          <p className="proposal-body">{preview.body}</p>
          <p className="muted small">
            {t("memory.tokens", { count: preview.bodyTokens })} ·{" "}
            {t("inbox.readOnly")}
          </p>
          <Link className="text-link" to="/inbox">
            {t("inbox.backToQueue")}
          </Link>
        </Card>
      ) : (
        <EmptyState title={t("inbox.proposalNotFound")} />
      )}
    </div>
  );
});
