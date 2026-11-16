import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { recordPath } from "@/entities/memory/model/links";
import type { MemoryStore } from "@/entities/memory/model/MemoryStore";
import {
  DECISION_STATUSES,
  RECORD_KINDS,
  RECORD_SCOPES,
  hasRecordFilters,
  type RecordKind,
  type RecordScope,
} from "@/entities/memory/model/types";
import {
  ProvenanceBadges,
  RecordKindBadge,
  RecordStatusBadge,
  ReviewDueBadge,
  ScopeBadge,
} from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import { Table } from "@/shared/ui/Table";
import { useFeedback } from "@/shared/ui/Feedback";

const kindKeys: Record<RecordKind, MessageKey> = {
  note: "record.kind.note",
  decision: "record.kind.decision",
  attempt: "record.kind.attempt",
  handoff: "record.kind.handoff",
};

export const MemoryPage = observer(function MemoryPage({
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
  const projectId = projects.selectedId;
  const projectDataReady = memory.projectId === projectId;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subtypeDraft, setSubtypeDraft] = useState(memory.filters.subtype);
  const [topicDraft, setTopicDraft] = useState(memory.filters.topic);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const selected =
    memory.items.find((record) => record.id === selectedId) ??
    memory.items[0] ??
    null;

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    memory.setProject(projectId);
    if (engine.isRunning) {
      void memory.load(projectId);
    }
  }, [engine.isRunning, memory, projectId]);

  const reload = (force = false): void => {
    if (projectId) {
      void memory.load(projectId, { force });
    }
  };

  const updateFilters = (patch: Parameters<MemoryStore["applyFilters"]>[0]): void => {
    memory.applyFilters(patch);
    reload();
  };

  const clearFilters = (): void => {
    memory.clearFilters();
    setSubtypeDraft("");
    setTopicDraft("");
    reload();
  };

  const toggleAllProjects = (enabled: boolean): void => {
    memory.setAllProjects(enabled);
    reload(true);
  };

  const confirmRestore = async (): Promise<void> => {
    const restored = await memory.restoreLast();
    setRestoreOpen(false);
    notify(
      restored ? t("memory.restored") : t("memory.restoreFailed"),
      restored ? "success" : "error",
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("memory.title")}</h2>
          <p className="muted">{t("memory.subtitle")}</p>
        </div>
        <Button disabled={!projectId || !engine.isRunning} onClick={() => reload(true)}>
          {t("actions.refresh")}
        </Button>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {projects.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={() => void projects.load(true)}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{projects.error}</span>
        </Notice>
      ) : null}

      <Card className="memory-filters">
        <div className="filter-grid">
          <label className="field">
            <span>{t("common.kind")}</span>
            <Select
              value={memory.filters.kinds[0] ?? ""}
              onChange={(event) =>
                updateFilters({
                  kinds: event.target.value
                    ? [event.target.value as RecordKind]
                    : [],
                })
              }
            >
              <option value="">{t("memory.allKinds")}</option>
              {RECORD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(kindKeys[kind])}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>{t("common.status")}</span>
            <Select
              value={memory.filters.status}
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              <option value="">{t("memory.allStatuses")}</option>
              {DECISION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`record.status.${status}` as MessageKey)}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>{t("common.scope")}</span>
            <Select
              value={memory.filters.scope}
              onChange={(event) =>
                updateFilters({
                  scope: event.target.value as RecordScope | "",
                })
              }
            >
              <option value="">{t("memory.allScopes")}</option>
              {RECORD_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {t(`record.scope.${scope}` as MessageKey)}
                </option>
              ))}
            </Select>
          </label>
          <label className="field">
            <span>{t("common.subtype")}</span>
            <input
              className="input"
              maxLength={80}
              value={subtypeDraft}
              onChange={(event) => setSubtypeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  updateFilters({ subtype: subtypeDraft });
                }
              }}
            />
          </label>
          <label className="field">
            <span>{t("common.topic")}</span>
            <input
              className="input"
              maxLength={80}
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  updateFilters({ topic: topicDraft });
                }
              }}
            />
          </label>
          <div className="filter-actions">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={memory.filters.dueReview}
                onChange={(event) =>
                  updateFilters({ dueReview: event.target.checked })
                }
              />
              {t("memory.dueReview")}
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={memory.allProjects}
                onChange={(event) => toggleAllProjects(event.target.checked)}
              />
              {t("memory.allProjects")}
            </label>
            <Button
              variant="secondary"
              onClick={() => updateFilters({ subtype: subtypeDraft, topic: topicDraft })}
            >
              {t("common.apply")}
            </Button>
            <Button variant="link" onClick={clearFilters}>
              {t("memory.clearFilters")}
            </Button>
          </div>
        </div>
      </Card>

      {memory.lastTrashed ? (
        <Notice
          variant="info"
          action={
            <Button
              variant="link"
              onClick={() => setRestoreOpen(true)}
              disabled={Boolean(memory.recordAction)}
            >
              {t("memory.restoreLast")}
            </Button>
          }
        >
          <span>
            {t("memory.trashUndo", { title: memory.lastTrashed.title })}
          </span>
        </Notice>
      ) : null}

      {memory.error ? (
        <Notice
          variant="error"
          action={
            <Button
              variant="link"
              onClick={() => {
                if (projectId) {
                  void memory.load(projectId, { force: true });
                }
              }}
            >
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{memory.error}</span>
          {memory.allProjects && memory.errorCode === "validation" ? (
            <span className="muted small"> {t("errors.allProjectsScope")}</span>
          ) : null}
        </Notice>
      ) : null}

      {!projects.loaded && projects.loading ? (
        <Loading label={t("common.loading")} />
      ) : !projectId ? (
        <EmptyState
          title={t("memory.noProject")}
          hint={t("projects.subtitle")}
          action={
            <Link className="text-link" to="/projects">
              {t("nav.projects")}
            </Link>
          }
        />
      ) : !projectDataReady || (!memory.loaded && memory.loading) ? (
        <Loading label={t("memory.title")} />
      ) : memory.loaded && memory.items.length === 0 ? (
        hasRecordFilters(memory.filters) ? (
          <EmptyState
            title={t("memory.noMatches")}
            hint={t("memory.noMatchesHint")}
            action={
              <Button variant="link" onClick={clearFilters}>
                {t("memory.clearFilters")}
              </Button>
            }
          />
        ) : (
          <EmptyState title={t("memory.noRecords")} hint={t("memory.noRecordsHint")} />
        )
      ) : memory.items.length > 0 ? (
        <div className="memory-layout">
          <Card className="memory-list">
            <div className="card-header">
              <div>
                <h3>{t("memory.title")}</h3>
                <p className="muted small">
                  {t("memory.count", { count: memory.items.length })}
                </p>
              </div>
            </div>
            <Table caption={t("memory.subtitle")}>
              <thead>
                <tr>
                  <th scope="col">{t("common.name")}</th>
                  {memory.allProjects ? (
                    <th scope="col">{t("common.project")}</th>
                  ) : null}
                  <th scope="col">{t("common.kind")}</th>
                  <th scope="col">{t("common.status")}</th>
                  <th scope="col">{t("common.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {memory.items.map((record) => (
                  <tr
                    key={record.id}
                    className={record.id === selected?.id ? "is-selected" : undefined}
                  >
                    <td data-label={t("common.name")}>
                      <Link
                        className="table-link"
                        to={recordPath(record.kind, record.id, record.projectId)}
                        onFocus={() => setSelectedId(record.id)}
                        onClick={() => setSelectedId(record.id)}
                      >
                        {record.title}
                      </Link>
                      <span className="badge-row table-badges">
                        <ReviewDueBadge review={record.review} />
                        <ProvenanceBadges
                          origin={record.provenance.origin}
                          quarantined={record.provenance.quarantined}
                          needsReview={record.provenance.needsReview}
                          reviewed={record.provenance.reviewed}
                        />
                      </span>
                    </td>
                    {memory.allProjects ? (
                      <td data-label={t("common.project")}>
                        <code>{record.projectId}</code>
                      </td>
                    ) : null}
                    <td data-label={t("common.kind")}>
                      <RecordKindBadge kind={record.kind} />
                    </td>
                    <td data-label={t("common.status")}>
                      {record.status ? (
                        <RecordStatusBadge status={record.status} />
                      ) : (
                        t("common.none")
                      )}
                    </td>
                    <td data-label={t("common.updated")}>
                      {record.updatedAt
                        ? formatDateTime(record.updatedAt, locale)
                        : t("common.none")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {memory.hasMore ? (
              <div className="form-actions">
                <Button
                  loading={memory.loadingMore}
                  onClick={() => void memory.loadMore()}
                >
                  {t("common.loadMore")}
                </Button>
              </div>
            ) : null}
          </Card>
          <aside className="memory-preview" aria-label={t("memory.preview")}>
            <Card>
              {selected ? (
                <>
                  <div className="badge-row">
                    <RecordKindBadge kind={selected.kind} />
                    {selected.scope ? <ScopeBadge scope={selected.scope} /> : null}
                  </div>
                  <h3 className="preview-title">{selected.title}</h3>
                  <dl className="details">
                    <dt>{t("common.project")}</dt>
                    <dd>{selected.projectId}</dd>
                    {selected.topicKey ? (
                      <>
                        <dt>{t("memory.topicKey")}</dt>
                        <dd>{selected.topicKey}</dd>
                      </>
                    ) : null}
                    {selected.updatedAt ? (
                      <>
                        <dt>{t("common.updated")}</dt>
                        <dd>{formatDateTime(selected.updatedAt, locale)}</dd>
                      </>
                    ) : null}
                    <dt>{t("record.validity")}</dt>
                    <dd>{selected.validity.current ? t("record.current") : t("record.superseded")}</dd>
                  </dl>
                  <Link
                    className="btn btn-primary"
                    to={recordPath(selected.kind, selected.id, selected.projectId)}
                  >
                    {t("memory.openRecord")}
                  </Link>
                </>
              ) : (
                <p className="muted">{t("memory.selectRecord")}</p>
              )}
            </Card>
          </aside>
        </div>
      ) : null}

      <ConfirmDialog
        open={restoreOpen}
        title={t("memory.restoreTitle")}
        confirmLabel={t("memory.restoreConfirm")}
        cancelLabel={t("common.cancel")}
        busy={memory.recordAction === "restore"}
        onConfirm={() => void confirmRestore()}
        onCancel={() => setRestoreOpen(false)}
      >
        <p>{t("memory.restoreBody", { title: memory.lastTrashed?.title ?? "" })}</p>
      </ConfirmDialog>
    </div>
  );
});
