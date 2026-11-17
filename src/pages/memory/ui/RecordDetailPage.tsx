import { useEffect, useId, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { recordPath } from "@/entities/memory/model/links";
import {
  RECORD_KINDS,
  TRUST_LEVELS,
  type MemoryRecord,
  type RecordDetail,
  type RecordKind,
  type RecordLink,
  type TrustLevel,
} from "@/entities/memory/model/types";
import {
  ProvenanceBadges,
  RecordKindBadge,
  RecordStatusBadge,
  ReviewDueBadge,
  ScopeBadge,
  TrustBadge,
} from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import { Tabs } from "@/shared/ui/Tabs";
import { useFeedback } from "@/shared/ui/Feedback";
import { RecordBody } from "./RecordBody";
import { RecordEditForm } from "./RecordEditForm";

const trustKeys: Record<TrustLevel, MessageKey> = {
  verified: "record.trust.verified",
  stated: "record.trust.stated",
  inferred: "record.trust.inferred",
};

function isRecordKind(value: string | undefined): value is RecordKind {
  return value !== undefined && RECORD_KINDS.includes(value as RecordKind);
}

export const RecordDetailPage = observer(function RecordDetailPage({
  memory,
  projects,
  engine,
}: {
  memory: MemoryStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams<{ kind: string; id: string }>();
  const queryProject = searchParams.get("project");
  const projectId = queryProject || projects.selectedId;
  const kind = params.kind;
  const recordId = params.id;
  const [trashOpen, setTrashOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [trust, setTrust] = useState<TrustLevel | "">("");
  const reviewSelectId = useId();

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (kind && recordId && projectId && engine.isRunning) {
      void memory.loadDetail(projectId, recordId, { history: true });
    }
    return () => {
      memory.editor.close();
      memory.clearDetail();
    };
  }, [engine.isRunning, kind, memory, projectId, recordId]);

  const detail = memory.detail;
  const copyPermalink = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      notify(t("memory.permalinkCopied"), "success");
    } catch {
      notify(t("memory.permalinkFailed"), "error");
    }
  };

  const cancelEdit = (): void => {
    if (memory.editor.dirty) {
      setDiscardOpen(true);
      return;
    }
    memory.editor.close();
  };

  const confirmTrash = async (): Promise<void> => {
    if (!projectId || !recordId) {
      return;
    }
    const done = await memory.trash(projectId, recordId);
    setTrashOpen(false);
    if (done) {
      notify(t("memory.trashed"), "success");
      navigate("/memory");
    } else if (memory.recordActionError) {
      notify(memory.recordActionError, "error");
    }
  };

  const confirmReview = async (): Promise<void> => {
    if (!reviewOpen || !projectId || !recordId || !detail) {
      return;
    }
    const done = await memory.review(projectId, recordId, {
      reviewed: true,
      trust: trust || undefined,
      expectedUpdatedAt: detail.updatedAt,
    });
    setReviewOpen(false);
    if (done) {
      notify(t("record.reviewedDone"), "success");
    } else if (memory.recordActionError) {
      notify(memory.recordActionError, "error");
    }
  };

  if (!isRecordKind(kind) || !recordId) {
    return (
      <div className="page">
        <EmptyState
          title={t("memory.detailNotFound")}
          action={
            <Link className="text-link" to="/memory">
              {t("memory.detailBack")}
            </Link>
          }
        />
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="page">
        <EmptyState
          title={t("memory.noProject")}
          action={
            <Link className="text-link" to="/projects">
              {t("nav.projects")}
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
          <Link className="text-link" to="/memory">
            ← {t("memory.detailBack")}
          </Link>
          <h2>{detail?.title ?? t("common.loading")}</h2>
          {detail ? (
            <span className="badge-row">
              <RecordKindBadge kind={detail.kind} />
              {detail.status ? <RecordStatusBadge status={detail.status} /> : null}
              {detail.scope ? <ScopeBadge scope={detail.scope} /> : null}
              <ReviewDueBadge review={detail.review} />
            </span>
          ) : null}
        </div>
        <div className="row-actions">
          {detail && !memory.editor.open ? (
            <Button
              disabled={!engine.isRunning || Boolean(memory.recordAction)}
              onClick={() => memory.editor.openFor(detail)}
            >
              {t("memory.editOpen")}
            </Button>
          ) : null}
          {detail && !memory.editor.open ? (
            <Button
              variant="danger"
              disabled={!engine.isRunning || Boolean(memory.recordAction)}
              onClick={() => setTrashOpen(true)}
            >
              {t("memory.trash")}
            </Button>
          ) : null}
          {detail && !detail.provenance.reviewed ? (
            <Button
              variant="primary"
              disabled={!engine.isRunning || Boolean(memory.recordAction)}
              loading={memory.recordAction === "review"}
              onClick={() => setReviewOpen(true)}
            >
              {t("record.reviewAction")}
            </Button>
          ) : null}
          {detail?.permalink && !memory.editor.open ? (
            <Button onClick={() => void copyPermalink(detail.permalink ?? "")}>
              {t("memory.copyPermalink")}
            </Button>
          ) : null}
        </div>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {detail && !detail.provenance.reviewed ? (
        <Notice variant="warning">
          <span>{t("record.quarantineWarning")}</span>
        </Notice>
      ) : null}

      {memory.detailError ? (
        <Notice
          variant="error"
          action={
            <Button
              variant="link"
              onClick={() => void memory.loadDetail(projectId, recordId, { force: true })}
            >
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{memory.detailError}</span>
        </Notice>
      ) : memory.detailLoading && !detail ? (
        <Loading label={t("memory.title")} />
      ) : detail ? (
        <>
          {memory.editor.open ? (
            <Card>
              <RecordEditForm
                key={`${detail.id}-${detail.updatedAt ?? ""}`}
                editor={memory.editor}
                disabled={!engine.isRunning}
                onCancel={cancelEdit}
                onSaved={() => void memory.loadDetail(projectId, recordId, { force: true })}
              />
            </Card>
          ) : null}

          {memory.editor.open ? null : (
            <Card>
              {detail.bodyTruncated ? (
                <Notice variant="info">
                  <span>
                    {t("memory.bodyTruncated", {
                      tokens: detail.bodyTokens,
                      max: detail.maxTokens,
                    })}
                  </span>
                </Notice>
              ) : null}
              <RecordBody body={detail.body} />
              {detail.tags && detail.tags.length > 0 ? (
                <div className="badge-row" aria-label={t("memory.editFieldTags")}>
                  {detail.tags.map((tag) => (
                    <Badge key={tag} tone="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="muted small">
                {t("memory.tokens", { count: detail.bodyTokens })} ·{" "}
                {detail.projectId} ·{" "}
                {detail.updatedAt
                  ? formatDateTime(detail.updatedAt, locale)
                  : t("common.none")}
              </p>
            </Card>
          )}

          <Card>
            <Tabs
              label={detail.title}
              items={[
                {
                  id: "provenance",
                  label: t("common.provenance"),
                  content: <ProvenancePanel detail={detail} />,
                },
                {
                  id: "links",
                  label: `${t("common.links")} (${detail.links.length + detail.backlinks.length})`,
                  content: <LinksPanel detail={detail} />,
                },
                {
                  id: "relations",
                  label: `${t("common.relations")} (${detail.relations.length})`,
                  content:
                    detail.relations.length === 0 ? (
                      <p className="muted">{t("memory.noRelations")}</p>
                    ) : (
                      <ul className="record-list">
                        {detail.relations.map((relation) => (
                          <li key={`${relation.target}-${relation.relation}`}>
                            {relation.targetKind ? (
                              <Link
                                className="table-link"
                                to={recordPath(
                                  relation.targetKind,
                                  relation.target,
                                  detail.projectId,
                                )}
                              >
                                {relation.target}
                              </Link>
                            ) : (
                              <code>{relation.target}</code>
                            )}{" "}
                            <Badge tone={relation.status === "accepted" ? "success" : "warning"}>
                              {relation.relation} · {relation.status}
                            </Badge>
                            {relation.reason ? (
                              <span className="muted small"> {relation.reason}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ),
                },
                {
                  id: "history",
                  label: t("common.history"),
                  content: <HistoryPanel detail={detail} />,
                },
              ]}
            />
          </Card>
        </>
      ) : null}

      <ConfirmDialog
        open={trashOpen}
        title={t("memory.trashTitle")}
        confirmLabel={t("memory.trashConfirm")}
        cancelLabel={t("common.cancel")}
        danger
        busy={memory.recordAction === "trash"}
        onConfirm={() => void confirmTrash()}
        onCancel={() => setTrashOpen(false)}
      >
        <p>{t("memory.trashBody")}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={discardOpen}
        title={t("memory.editDiscardTitle")}
        confirmLabel={t("memory.editDiscard")}
        cancelLabel={t("common.cancel")}
        danger
        onConfirm={() => {
          setDiscardOpen(false);
          memory.editor.close();
        }}
        onCancel={() => setDiscardOpen(false)}
      >
        <p>{t("memory.editDiscardBody")}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={reviewOpen}
        title={t("record.reviewTitle")}
        confirmLabel={t("record.reviewAction")}
        cancelLabel={t("common.cancel")}
        busy={memory.recordAction === "review"}
        onConfirm={() => void confirmReview()}
        onCancel={() => setReviewOpen(false)}
      >
        <p>{t("record.reviewBody", { title: detail?.title ?? recordId })}</p>
        <label className="field" htmlFor={reviewSelectId}>
          <span>{t("record.reviewTrust")}</span>
          <Select
            id={reviewSelectId}
            value={trust}
            onChange={(event) => setTrust(event.target.value as TrustLevel | "")}
          >
            <option value="">{t("record.keepTrust")}</option>
            {TRUST_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(trustKeys[level])}
              </option>
            ))}
          </Select>
        </label>
      </ConfirmDialog>
    </div>
  );
});

function ProvenancePanel({ detail }: { detail: RecordDetail }) {
  const { t, locale } = useI18n();
  return (
    <div className="provenance-grid">
      <div>
        <h3>{t("common.provenance")}</h3>
        <ProvenanceBadges
          origin={detail.provenance.origin}
          quarantined={detail.provenance.quarantined}
          needsReview={detail.provenance.needsReview}
          reviewed={detail.provenance.reviewed}
        />
        <dl className="details">
          <dt>{t("common.project")}</dt>
          <dd>{detail.projectId}</dd>
          <dt>{t("memory.path")}</dt>
          <dd><code>{detail.path}</code></dd>
          {detail.permalink ? (
            <>
              <dt>{t("memory.permalink")}</dt>
              <dd><code>{detail.permalink}</code></dd>
            </>
          ) : null}
          <dt>{t("record.trust")}</dt>
          <dd><TrustBadge trust={detail.provenance.trust} /></dd>
          <dt>{t("memory.reviewAfter")}</dt>
          <dd>
            {detail.review.reviewAfter
              ? formatDateTime(detail.review.reviewAfter, locale)
              : t("common.none")}
          </dd>
        </dl>
      </div>
      <div>
        <h3>{t("record.validity")}</h3>
        <dl className="details">
          <dt>{t("memory.validFrom")}</dt>
          <dd>
            {detail.validity.validFrom
              ? formatDateTime(detail.validity.validFrom, locale)
              : t("common.none")}
          </dd>
          <dt>{t("memory.validTo")}</dt>
          <dd>
            {detail.validity.validTo
              ? formatDateTime(detail.validity.validTo, locale)
              : t("common.none")}
          </dd>
          <dt>{t("record.confidence")}</dt>
          <dd>
            {detail.validity.confidence !== undefined
              ? detail.validity.confidence.toFixed(2)
              : t("common.none")}
          </dd>
          <dt>{t("record.current")}</dt>
          <dd>{detail.validity.current ? t("engine.yes") : t("common.none")}</dd>
          <dt>{t("memory.supersededBy")}</dt>
          <dd>{detail.validity.supersededBy ?? t("common.none")}</dd>
          <dt>{t("memory.supersedes")}</dt>
          <dd>{detail.validity.supersedes ?? t("common.none")}</dd>
        </dl>
      </div>
    </div>
  );
}

function LinksPanel({ detail }: { detail: RecordDetail }) {
  const { t } = useI18n();
  return (
    <div className="provenance-grid">
      <div>
        <h3>{t("common.links")}</h3>
        {detail.links.length === 0 ? (
          <p className="muted">{t("memory.noLinks")}</p>
        ) : (
          <ul className="record-list">
            {detail.links.map((link) => (
              <li key={`${link.field}-${link.ref}`}>
                <span className="muted small">{link.field}</span>{" "}
                {renderLink(link, t)}
                {link.state !== "found" ? (
                  <Badge tone={link.state === "missing" ? "danger" : "warning"}>
                    {t(`memory.link${link.state === "missing" ? "Missing" : "Unavailable"}`)}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3>{t("common.backlinks")}</h3>
        {detail.backlinks.length === 0 ? (
          <p className="muted">{t("memory.noBacklinks")}</p>
        ) : (
          <ul className="record-list">
            {detail.backlinks.map((backlink) => (
              <li key={`${backlink.field}-${backlink.source.id}`}>
                <span className="muted small">{backlink.field}</span>{" "}
                <RecordLinkItem record={backlink.source} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function renderLink(
  link: RecordLink,
  t: (key: "memory.linkFound" | "memory.linkMissing" | "memory.linkUnavailable") => string,
): ReactNode {
  if (link.target) {
    return <RecordLinkItem record={link.target} />;
  }
  const state =
    link.state === "found"
      ? t("memory.linkFound")
      : link.state === "missing"
        ? t("memory.linkMissing")
        : t("memory.linkUnavailable");
  return (
    <span>
      {link.text ?? link.ref} ({state})
    </span>
  );
}

function RecordLinkItem({ record }: { record: MemoryRecord }) {
  return (
    <Link
      className="table-link"
      to={recordPath(record.kind, record.id, record.projectId)}
    >
      {record.title}
    </Link>
  );
}

function HistoryPanel({ detail }: { detail: RecordDetail }) {
  const { t, locale } = useI18n();
  const history = detail.history;
  if (!history || history.records.length === 0) {
    return <p className="muted">{t("memory.noHistory")}</p>;
  }
  return (
    <>
      <p className="muted small">
        {t("memory.historyTotal", { count: history.total })}
      </p>
      <ol className="record-list history-list">
        {history.records.map((record, index) => (
          <li key={record.id} className={index === history.anchorIndex ? "is-current" : undefined}>
            <RecordLinkItem record={record} />
            {index === history.anchorIndex ? (
              <Badge tone="success">{t("memory.historyAnchor")}</Badge>
            ) : null}
            <span className="muted small">
              {" "}
              {record.updatedAt ? formatDateTime(record.updatedAt, locale) : ""}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
