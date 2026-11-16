import { useEffect, useId, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { recordPath } from "@/entities/memory/model/links";
import type { QuarantineStore } from "@/entities/memory/model/QuarantineStore";
import type { ReviewStore } from "@/entities/memory/model/ReviewStore";
import {
  TRUST_LEVELS,
  type QuarantineItem,
  type TrustLevel,
} from "@/entities/memory/model/types";
import { RecordKindBadge, TrustBadge } from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import { Table } from "@/shared/ui/Table";
import { useFeedback } from "@/shared/ui/Feedback";

const reasonKeys: Record<QuarantineItem["reason"], MessageKey> = {
  unreviewed: "quarantine.reason.unreviewed",
  unknown_origin: "quarantine.reason.unknownOrigin",
};

const trustKeys: Record<TrustLevel, MessageKey> = {
  verified: "record.trust.verified",
  stated: "record.trust.stated",
  inferred: "record.trust.inferred",
};

function ageText(seconds: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) {
    return format.format(-Math.max(1, Math.round(seconds)), "second");
  }
  if (seconds < 3600) {
    return format.format(-Math.round(seconds / 60), "minute");
  }
  if (seconds < 86400) {
    return format.format(-Math.round(seconds / 3600), "hour");
  }
  return format.format(-Math.round(seconds / 86400), "day");
}

export const QuarantinePage = observer(function QuarantinePage({
  quarantine,
  review,
  projects,
  engine,
}: {
  quarantine: QuarantineStore;
  review: ReviewStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const projectId = projects.selectedId;
  const dataReady = quarantine.projectId === projectId;
  const [trust, setTrust] = useState<Record<string, TrustLevel | "">>({});
  const [pending, setPending] = useState<QuarantineItem | null>(null);
  const selectId = useId();

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    quarantine.setProject(projectId);
    if (engine.isRunning) {
      void quarantine.load(projectId);
    }
  }, [engine.isRunning, projectId, quarantine]);

  const confirmReview = async (): Promise<void> => {
    if (!pending || !projectId) {
      return;
    }
    const choice = trust[pending.id] || undefined;
    const done = await quarantine.review(projectId, pending.id, choice);
    setPending(null);
    if (done) {
      void review.refresh(projectId);
      notify(
        t(
          pending.reason === "unknown_origin"
            ? "quarantine.reviewedUnknownOrigin"
            : "quarantine.reviewed",
        ),
        "success",
      );
    } else if (quarantine.actionError) {
      notify(quarantine.actionError, "error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link className="text-link" to="/inbox">
            ← {t("quarantine.back")}
          </Link>
          <h2>{t("quarantine.title")}</h2>
          <p className="muted">{t("quarantine.subtitle")}</p>
        </div>
        <div className="row-actions">
          <label className="inline-field">
            <span className="muted small">{t("quarantine.projectFilter")}</span>
            <Select
              value={projectId ?? ""}
              disabled={projects.items.length === 0}
              onChange={(event) => projects.select(event.target.value || null)}
            >
              {projects.items.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || project.id}
                </option>
              ))}
            </Select>
          </label>
          <Button
            disabled={!projectId || !engine.isRunning || quarantine.loading}
            onClick={() => void quarantine.refresh()}
          >
            {quarantine.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
        </div>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {quarantine.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={() => void quarantine.refresh()}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{quarantine.error}</span>
        </Notice>
      ) : null}

      {quarantine.actionError ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={quarantine.dismissError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{quarantine.actionError}</span>
        </Notice>
      ) : null}

      {!projectId ? (
        <EmptyState title={t("memory.noProject")} />
      ) : !dataReady || (!quarantine.loaded && quarantine.loading) ? (
        <Loading label={t("quarantine.title")} />
      ) : quarantine.isEmpty ? (
        <EmptyState
          title={t("quarantine.empty")}
          hint={t("quarantine.emptyHint")}
        />
      ) : (
        <Card>
          <div className="card-header">
            <div>
              <h3>{t("quarantine.count", { count: quarantine.items.length })}</h3>
              <p className="muted small">{t("quarantine.hint")}</p>
            </div>
          </div>
          <Table caption={t("quarantine.subtitle")}>
            <thead>
              <tr>
                <th scope="col">{t("common.name")}</th>
                <th scope="col">{t("quarantine.reason")}</th>
                <th scope="col">{t("record.trust")}</th>
                <th scope="col">{t("inbox.age")}</th>
                <th scope="col">{t("quarantine.review")}</th>
              </tr>
            </thead>
            <tbody>
              {quarantine.items.map((item) => {
                const selectControl = `${selectId}-${item.id}`;
                return (
                  <tr key={`${item.projectId}-${item.id}`}>
                    <td data-label={t("common.name")}>
                      <Link
                        className="table-link"
                        to={recordPath(item.kind, item.id, item.projectId)}
                      >
                        {item.title}
                      </Link>
                      <span className="badge-row table-badges">
                        <RecordKindBadge kind={item.kind} />
                        <Badge tone="neutral">{item.projectId}</Badge>
                        {item.origin ? <Badge>{item.origin}</Badge> : null}
                      </span>
                    </td>
                    <td data-label={t("quarantine.reason")}>
                      <Badge
                        tone={
                          item.reason === "unknown_origin" ? "danger" : "warning"
                        }
                      >
                        {t(reasonKeys[item.reason])}
                      </Badge>
                    </td>
                    <td data-label={t("record.trust")}>
                      {item.trust && TRUST_LEVELS.includes(item.trust as TrustLevel) ? (
                        <TrustBadge trust={item.trust as TrustLevel} />
                      ) : (
                        t("common.none")
                      )}
                    </td>
                    <td data-label={t("inbox.age")}>
                      {ageText(item.ageSeconds, locale)}
                    </td>
                    <td data-label={t("quarantine.review")}>
                      <div className="row-actions">
                        <label className="field" htmlFor={selectControl}>
                          <span className="muted small">
                            {t("quarantine.trustChoice")}
                          </span>
                          <Select
                            id={selectControl}
                            value={trust[item.id] ?? ""}
                            onChange={(event) =>
                              setTrust((current) => ({
                                ...current,
                                [item.id]: event.target.value as TrustLevel | "",
                              }))
                            }
                          >
                            <option value="">{t("quarantine.keepTrust")}</option>
                            {TRUST_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                {t(trustKeys[level])}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <Button
                          variant="secondary"
                          aria-label={`${t("quarantine.review")}: ${item.title}`}
                          loading={quarantine.reviewingId === item.id}
                          disabled={
                            !engine.isRunning || Boolean(quarantine.reviewingId)
                          }
                          onClick={() => setPending(item)}
                        >
                          {t("quarantine.review")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {quarantine.hasMore ? (
            <div className="form-actions">
              <Button
                loading={quarantine.loadingMore}
                onClick={() => void quarantine.loadMore()}
              >
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={t("quarantine.reviewTitle")}
        confirmLabel={t("quarantine.review")}
        cancelLabel={t("common.cancel")}
        busy={Boolean(quarantine.reviewingId)}
        onConfirm={() => void confirmReview()}
        onCancel={() => setPending(null)}
      >
        <p>
          {t("quarantine.reviewBody", { title: pending?.title ?? "" })}
        </p>
        {pending?.reason === "unknown_origin" ? (
          <p className="muted small">{t("quarantine.unknownOriginHint")}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
});
