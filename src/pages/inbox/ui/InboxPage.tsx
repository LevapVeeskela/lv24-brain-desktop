import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { ReviewStore } from "@/entities/memory/model/ReviewStore";
import {
  isPromotableBulk,
  proposalBlockers,
  type Proposal,
  type ReviewFixResult,
} from "@/entities/memory/model/types";
import {
  ConfidenceBadge,
  RecordKindBadge,
  SourceHealthBadges,
} from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { useFeedback } from "@/shared/ui/Feedback";
import { nextSelection, sortProposals } from "../model/queue";

const PROPOSAL_PREVIEW_TOKENS = 600;

type InboxTab = "proposals" | "findings";

function relativeTime(value: string | undefined, locale: string): string {
  if (!value) {
    return "—";
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return value;
  }
  const seconds = Math.round((time - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const absolute = Math.abs(seconds);
  if (absolute < 60) {
    return format.format(seconds, "second");
  }
  if (absolute < 3600) {
    return format.format(Math.round(seconds / 60), "minute");
  }
  if (absolute < 86400) {
    return format.format(Math.round(seconds / 3600), "hour");
  }
  return format.format(Math.round(seconds / 86400), "day");
}

function overdueText(seconds: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (seconds < 3600) {
    return format.format(Math.max(1, Math.round(seconds / 60)), "minute");
  }
  if (seconds < 86400) {
    return format.format(Math.round(seconds / 3600), "hour");
  }
  return format.format(Math.round(seconds / 86400), "day");
}

function proposalDetailPath(proposal: Proposal): string {
  return `/inbox/proposal/${encodeURIComponent(proposal.projectId)}/${encodeURIComponent(proposal.id)}`;
}

export const InboxPage = observer(function InboxPage({
  review,
  projects,
  engine,
}: {
  review: ReviewStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const projectId = projects.selectedId;
  const dataReady = review.isReadyFor(projectId);
  const [tab, setTab] = useState<InboxTab>("proposals");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [force, setForce] = useState(false);
  const [localYes, setLocalYes] = useState(false);
  const [applyFixOpen, setApplyFixOpen] = useState(false);
  const proposals = sortProposals(review.proposals);
  const active = proposals.find((proposal) => proposal.id === selectedId) ?? proposals[0] ?? null;
  const preview = review.previewId === active?.id ? review.preview : null;
  const listed = active ? review.bodies[active.id] : undefined;
  const listedBody = listed?.body;

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    review.setProject(projectId);
    if (engine.isRunning) {
      void review.load(projectId);
    }
  }, [engine.isRunning, projectId, review]);

  useEffect(() => {
    setEditing(false);
    setTitle(active?.title ?? "");
    setForce(false);
    setLocalYes(false);
  }, [active?.id, active?.title]);

  useEffect(() => {
    if (!projectId || !engine.isRunning || review.allProjects) {
      return;
    }
    void review.loadProposalBodies(projectId, PROPOSAL_PREVIEW_TOKENS);
  }, [engine.isRunning, projectId, review, review.allProjects]);

  useEffect(() => {
    if (!active || !engine.isRunning) {
      review.clearPreview();
      return;
    }
    if (listedBody !== undefined) {
      return;
    }
    void review.loadPreview(
      active.projectId,
      active.id,
      PROPOSAL_PREVIEW_TOKENS,
    );
  }, [active?.id, active?.projectId, engine.isRunning, listedBody, review]);

  const toggleAllProjects = (enabled: boolean): void => {
    review.setAllProjects(enabled);
    if (projectId) {
      void review.load(projectId, { force: true, allProjects: enabled });
    }
  };

  const confirmFlags = (proposal: Proposal): boolean => {
    const blockers = proposalBlockers(proposal);
    if (blockers.includes("local-only") && !localYes) {
      return false;
    }
    if (
      (blockers.includes("stale") || blockers.includes("orphan")) &&
      !force
    ) {
      return false;
    }
    return true;
  };

  const accept = async (proposal: Proposal): Promise<void> => {
    const targetProject = proposal.projectId || projectId;
    if (!targetProject || !engine.isRunning || review.isBusy(proposal.id)) {
      return;
    }
    if (!confirmFlags(proposal)) {
      notify(t("inbox.acceptBlocked"), "error");
      return;
    }
    const outcome = await review.promote(targetProject, proposal.id, {
      as: proposal.kind,
      status: "proposed",
      title: title.trim() && title.trim() !== proposal.title ? title.trim() : undefined,
      force: proposal.sourceStale || proposal.sourceOrphan ? true : undefined,
      yes: proposal.localOnly ? true : undefined,
    });
    if (outcome) {
      notify(
        t("inbox.promoted", {
          kind: outcome.recordKind ?? proposal.kind,
          id: outcome.recordId ?? proposal.id,
        }),
        "success",
      );
      setChecked((current) => current.filter((id) => id !== proposal.id));
    } else {
      notify(t("inbox.actionFailed"), "error");
    }
  };

  const dismiss = async (proposal: Proposal): Promise<void> => {
    const targetProject = proposal.projectId || projectId;
    if (!targetProject || !engine.isRunning || review.isBusy(proposal.id)) {
      return;
    }
    const outcome = await review.dismiss(targetProject, proposal.id, {});
    if (outcome) {
      notify(t("inbox.dismissed"), "success");
      setChecked((current) => current.filter((id) => id !== proposal.id));
    } else {
      notify(t("inbox.actionFailed"), "error");
    }
  };

  const checkedProposals = proposals.filter((proposal) =>
    checked.includes(proposal.id),
  );
  // A bulk promotion writes one project; an aggregate queue may span several.
  const canBulk = !review.allProjects && isPromotableBulk(checkedProposals);

  const bulkAccept = async (): Promise<void> => {
    if (!projectId || !canBulk) {
      return;
    }
    const kind = checkedProposals[0].kind;
    const promoted = await review.promoteMany(
      projectId,
      checkedProposals.map((proposal) => proposal.id),
      { as: kind, status: "proposed" },
    );
    if (promoted > 0) {
      notify(t("inbox.bulkDone", { count: promoted }), "success");
      setChecked([]);
    } else {
      notify(t("inbox.actionFailed"), "error");
    }
  };

  const previewFix = async (): Promise<void> => {
    if (projectId) {
      await review.previewFix(projectId);
    }
  };

  const applyFix = async (): Promise<void> => {
    if (!projectId) {
      return;
    }
    const applied = await review.applyFix(projectId);
    setApplyFixOpen(false);
    notify(
      applied
        ? t("inbox.fixApplied", { count: applied.changes.length })
        : t("inbox.fixFailed"),
      applied ? "success" : "error",
    );
  };

  useEffect(() => {
    if (tab !== "proposals" || !active) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      switch (event.key.toLowerCase()) {
        case "a":
          event.preventDefault();
          void accept(active);
          break;
        case "d":
          event.preventDefault();
          void dismiss(active);
          break;
        case "e":
          event.preventDefault();
          setEditing(true);
          break;
        case "j":
          event.preventDefault();
          setSelectedId(nextSelection(proposals, active.id, 1));
          break;
        case "k":
          event.preventDefault();
          setSelectedId(nextSelection(proposals, active.id, -1));
          break;
        case "escape":
          setEditing(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("inbox.title")}</h2>
          <p className="muted">{t("inbox.subtitle")}</p>
        </div>
        <div className="row-actions">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={review.allProjects}
              onChange={(event) => toggleAllProjects(event.target.checked)}
            />
            {t("memory.allProjects")}
          </label>
          <Button
            disabled={!projectId || !engine.isRunning || review.loading}
            onClick={() => void review.refresh()}
          >
            {review.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
        </div>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {review.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={() => void review.refresh()}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{review.error}</span>
          {review.allProjects && review.errorCode === "validation" ? (
            <span className="muted small"> {t("errors.allProjectsScope")}</span>
          ) : null}
        </Notice>
      ) : null}

      {review.actionError ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={review.clearActionError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{review.actionError}</span>
        </Notice>
      ) : null}

      {review.report?.findingsTruncated ||
      review.report?.dueReviewsTruncated ||
      review.report?.proposalsTruncated ? (
        <Notice variant="info">
          <span>{t("inbox.truncated")}</span>
        </Notice>
      ) : null}

      <div
        className="tabs-list"
        role="tablist"
        aria-label={t("inbox.title")}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
          }
          event.preventDefault();
          const next = tab === "proposals" ? "findings" : "proposals";
          setTab(next);
          document.getElementById(`inbox-${next}-tab`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          id="inbox-proposals-tab"
          aria-selected={tab === "proposals"}
          aria-controls="inbox-proposals"
          tabIndex={tab === "proposals" ? 0 : -1}
          onClick={() => setTab("proposals")}
        >
          {t("inbox.tab.proposals", { count: review.pendingCount })}
        </button>
        <button
          type="button"
          role="tab"
          id="inbox-findings-tab"
          aria-selected={tab === "findings"}
          aria-controls="inbox-findings"
          tabIndex={tab === "findings" ? 0 : -1}
          onClick={() => setTab("findings")}
        >
          {t("inbox.tab.findings", { count: review.findings.length })}
        </button>
      </div>

      <div
        id="inbox-proposals"
        role="tabpanel"
        aria-labelledby="inbox-proposals-tab"
        hidden={tab !== "proposals"}
        aria-label={t("inbox.tab.proposals", { count: review.pendingCount })}
      >
          {!projectId ? (
            <EmptyState title={t("memory.noProject")} />
          ) : !dataReady || (!review.loaded && review.loading) ? (
            <Loading label={t("inbox.title")} />
          ) : proposals.length === 0 ? (            <EmptyState
              title={t("inbox.empty")}
              hint={t("inbox.emptyHint")}
            />
          ) : (
            <div className="inbox-layout">
              <Card className="inbox-queue">
                <div className="card-header">
                  <div>
                    <h3>
                      {t("inbox.tab.proposals", { count: proposals.length })}
                    </h3>
                    <p className="muted small">
                      {t("inbox.shortcuts")}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!canBulk || !engine.isRunning}
                    title={canBulk ? undefined : t("inbox.bulkHint")}
                    onClick={() => void bulkAccept()}
                  >
                    {t("inbox.bulkAccept", { count: checkedProposals.length })}
                  </Button>
                </div>
                <ul className="queue-list">
                  {proposals.map((proposal) => (
                    <li
                      key={proposal.id}
                      className={`queue-item ${proposal.id === active?.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="queue-check"
                        aria-label={t("inbox.select", { title: proposal.title })}
                        checked={checked.includes(proposal.id)}
                        onChange={(event) =>
                          setChecked((current) =>
                            event.target.checked
                              ? [...current, proposal.id]
                              : current.filter((id) => id !== proposal.id),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="queue-select"
                        aria-pressed={proposal.id === active?.id}
                        onClick={() => setSelectedId(proposal.id)}
                      >
                        <span className="queue-title">{proposal.title}</span>
                        <span className="badge-row">
                          <RecordKindBadge kind={proposal.kind} />
                          <ConfidenceBadge confidence={proposal.confidence} />
                          <SourceHealthBadges proposal={proposal} />
                          {review.allProjects ? (
                            <Badge tone="neutral">{proposal.projectId}</Badge>
                          ) : null}
                        </span>
                        <span className="muted small">
                          {proposal.connectionId} ·{" "}
                          {relativeTime(proposal.createdAt, locale)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              {active ? (
                <Card className="inbox-detail">
                  {editing ? (
                    <label className="field">
                      <span>{t("inbox.titleLabel")}</span>
                      <input
                        className="input"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setEditing(false);
                          }
                        }}
                      />
                    </label>
                  ) : (
                    <h3>{active.title}</h3>
                  )}
                  <div className="badge-row">
                    <RecordKindBadge kind={active.kind} />
                    <ConfidenceBadge confidence={active.confidence} />
                    <Badge>{t(`inbox.status.${active.status}` as MessageKey)}</Badge>
                    <SourceHealthBadges proposal={active} />
                    {review.allProjects ? (
                      <Badge tone="neutral">{active.projectId}</Badge>
                    ) : null}
                  </div>
                  <dl className="details">
                    <dt>{t("inbox.kind")}</dt>
                    <dd><RecordKindBadge kind={active.kind} /></dd>
                    <dt>{t("inbox.connection")}</dt>
                    <dd>{active.connectionId}</dd>
                    <dt>{t("inbox.age")}</dt>
                    <dd>{relativeTime(active.createdAt, locale)}</dd>
                    <dt>{t("inbox.rule")}</dt>
                    <dd>{active.rule ?? t("common.none")}</dd>
                  </dl>

                  <section
                    className="proposal-preview"
                    aria-label={t("inbox.preview")}
                  >
                    <h4>{t("inbox.preview")}</h4>
                    {review.previewLoading ? (
                      <Loading label={t("inbox.preview")} />
                    ) : review.previewError && listedBody === undefined ? (
                      <p className="inline-error" role="alert">
                        {review.previewError}
                      </p>
                    ) : listedBody !== undefined || preview ? (
                      <>
                        <p className="proposal-body">
                          {listedBody ?? preview?.body}
                        </p>
                        {listed?.bodyTruncated || preview?.bodyTruncated ? (
                          <p className="muted small">
                            {t("inbox.previewTruncated", {
                              tokens:
                                listed?.bodyTokens ?? preview?.bodyTokens ?? 0,
                              max: listed?.maxTokens ?? preview?.maxTokens ?? 0,
                            })}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="muted small">{t("inbox.previewEmpty")}</p>
                    )}
                    <Link
                      className="text-link"
                      to={proposalDetailPath(active)}
                    >
                      {t("inbox.openDetail")}
                    </Link>
                  </section>

                  {active.sourceStale || active.sourceOrphan ? (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={force}
                        onChange={(event) => setForce(event.target.checked)}
                      />
                      {t("inbox.force")}
                    </label>
                  ) : null}
                  {active.localOnly ? (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={localYes}
                        onChange={(event) => setLocalYes(event.target.checked)}
                      />
                      {t("inbox.confirmLocal")}
                    </label>
                  ) : null}
                  {!confirmFlags(active) ? (
                    <p className="muted small">{t("inbox.acceptBlocked")}</p>
                  ) : null}
                  <div className="form-actions">
                    <Button
                      variant="primary"
                      loading={review.isBusy(active.id)}
                      disabled={!confirmFlags(active) || !engine.isRunning}
                      onClick={() => void accept(active)}
                    >
                      {t("inbox.accept")}
                    </Button>
                    <Button
                      disabled={review.isBusy(active.id) || !engine.isRunning}
                      onClick={() => setEditing((current) => !current)}
                    >
                      {t("inbox.editTitle")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={review.isBusy(active.id) || !engine.isRunning}
                      onClick={() => void dismiss(active)}
                    >
                      {t("inbox.dismiss")}
                    </Button>
                  </div>
                </Card>
              ) : null}
            </div>
          )}
        </div>
      <div
        id="inbox-findings"
        role="tabpanel"
        aria-labelledby="inbox-findings-tab"
        hidden={tab !== "findings"}
        aria-label={t("inbox.tab.findings", { count: review.findings.length })}
        className="findings-layout"
      >
          {!dataReady || (!review.loaded && review.loading) ? (
            <Loading label={t("inbox.title")} />
          ) : null}
          {review.quarantinedCount > 0 ? (
            <Notice variant="info">
              <span>
                {t("inbox.quarantine", { count: review.quarantinedCount })}
              </span>{" "}
              <Link className="text-link" to="/quarantine">
                {t("inbox.openQuarantine")}
              </Link>
            </Notice>
          ) : null}

          <Card>
            <div className="card-header">
              <div>
                <h3>{t("inbox.fixTitle")}</h3>
                <p className="muted">{t("inbox.fixSubtitle")}</p>
              </div>
              <Button
                disabled={
                  !projectId ||
                  !engine.isRunning ||
                  review.allProjects ||
                  review.fixPreviewLoading
                }
                title={review.allProjects ? t("inbox.fixNeedsProject") : undefined}
                loading={review.fixPreviewLoading}
                onClick={() => void previewFix()}
              >
                {t("inbox.fixPreview")}
              </Button>
            </div>
            {review.allProjects ? (
              <p className="muted small">{t("inbox.fixNeedsProject")}</p>
            ) : null}
            {review.fixError ? (
              <p className="inline-error" role="alert">
                {review.fixError}
              </p>
            ) : null}
            {review.fixApplied ? (
              <FixChanges
                result={review.fixApplied}
                title={t("inbox.fixAppliedTitle", {
                  count: review.fixApplied.changes.length,
                })}
              />
            ) : review.fixPreview ? (
              review.fixPreview.changes.length === 0 ? (
                <p className="muted">{t("inbox.fixNone")}</p>
              ) : (
                <>
                  <FixChanges
                    result={review.fixPreview}
                    title={t("inbox.fixPlanned", {
                      count: review.fixPreview.changes.length,
                    })}
                  />
                  <p className="muted small">{t("inbox.fixDryRun")}</p>
                  <div className="form-actions">
                    <Button
                      variant="primary"
                      disabled={review.fixApplyLoading}
                      onClick={() => setApplyFixOpen(true)}
                    >
                      {t("inbox.fixApply", {
                        count: review.fixPreview.changes.length,
                      })}
                    </Button>
                    <Button variant="ghost" onClick={review.clearFix}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </>
              )
            ) : null}
          </Card>

          {review.findings.length === 0 ? (
            <EmptyState title={t("inbox.findingsEmpty")} />
          ) : (
            review.findings.map((finding) => (
              <Card key={`${finding.projectId ?? ""}-${finding.kind}-${finding.message}`}>
                <div className="badge-row">
                  <Badge
                    tone={
                      finding.severity === "error"
                        ? "danger"
                        : finding.severity === "warn"
                          ? "warning"
                          : "info"
                    }
                  >
                    {finding.severity}
                  </Badge>
                  <Badge>{finding.kind}</Badge>
                  {review.allProjects && finding.projectId ? (
                    <Badge tone="neutral">{finding.projectId}</Badge>
                  ) : null}
                  {finding.fixable ? <Badge tone="success">{t("inbox.findingFix", { fix: finding.fix ?? "" })}</Badge> : null}
                </div>
                <h3>{finding.message}</h3>
                <dl className="details">
                  <dt>{t("inbox.findingWhy")}</dt>
                  <dd>{finding.why}</dd>
                  <dt>{t("inbox.findingNext")}</dt>
                  <dd>{finding.next}</dd>
                  <dt>{t("inbox.findingConfirm")}</dt>
                  <dd>{finding.confirm}</dd>
                  {finding.evidence ? (
                    <>
                      <dt>{t("inbox.findingEvidence")}</dt>
                      <dd>{finding.evidence}</dd>
                    </>
                  ) : null}
                </dl>
              </Card>
            ))
          )}
          <Card>
            <h3>{t("inbox.dueTitle")}</h3>
            {review.dueReviews.length === 0 ? (
              <p className="muted">{t("inbox.dueEmpty")}</p>
            ) : (
              <ul className="record-list">
                {review.dueReviews.map((due) => {
                  const recordLink =
                    due.kind === "note" ||
                    due.kind === "decision" ||
                    due.kind === "attempt" ||
                    due.kind === "handoff" ? (
                      <Link
                        className="table-link"
                        to={`/memory/${due.kind}/${encodeURIComponent(due.id)}${
                          due.projectId
                            ? `?project=${encodeURIComponent(due.projectId)}`
                            : ""
                        }`}
                      >
                        {due.title}
                      </Link>
                    ) : (
                      <span>{due.title}</span>
                    );
                  return (
                    <li key={`${due.projectId ?? ""}-${due.kind}-${due.id}`}>
                      {recordLink}{" "}
                      {due.projectId ? (
                        <Badge tone="neutral">{due.projectId}</Badge>
                      ) : null}{" "}
                      <Badge tone="warning">
                        {t("inbox.overdueBy", {
                          value: overdueText(due.overdueSeconds, locale),
                        })}
                      </Badge>{" "}
                      <span className="muted small">{due.kind}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

      <ConfirmDialog
        open={applyFixOpen}
        title={t("inbox.fixApplyTitle")}
        confirmLabel={t("inbox.fixApply", {
          count: review.fixPreview?.changes.length ?? 0,
        })}
        cancelLabel={t("common.cancel")}
        busy={review.fixApplyLoading}
        onConfirm={() => void applyFix()}
        onCancel={() => setApplyFixOpen(false)}
      >
        <p>{t("inbox.fixApplyBody")}</p>
      </ConfirmDialog>
    </div>
  );
});

function FixChanges({
  result,
  title,
}: {
  result: ReviewFixResult;
  title: string;
}) {
  const { t } = useI18n();
  if (result.changes.length === 0) {
    return <p className="muted">{t("inbox.fixNone")}</p>;
  }
  return (
    <>
      <h4>{title}</h4>
      {result.findings.length > 0 ? (
        <ul className="record-list">
          {result.findings.map((finding) => (
            <li key={`${finding.kind}-${finding.message}`}>
              <Badge
                tone={
                  finding.severity === "error"
                    ? "danger"
                    : finding.severity === "warn"
                      ? "warning"
                      : "info"
                }
              >
                {finding.severity}
              </Badge>{" "}
              {finding.message}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="record-list">
        {result.changes.map((change, index) => (
          <li key={`${change.kind}-${change.action}-${index}`}>
            <Badge tone="info">{change.action}</Badge>{" "}
            <code>{change.field}</code>{" "}
            <span>{change.value}</span>
            {change.evidence ? (
              <span className="muted small"> — {change.evidence}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
