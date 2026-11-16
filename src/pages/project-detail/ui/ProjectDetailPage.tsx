import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useParams } from "react-router-dom";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { RecordKindBadge } from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type {
  ProjectState,
  ProjectStatePatch,
} from "@/entities/project/model/types";
import { useI18n } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Table } from "@/shared/ui/Table";
import { useFeedback } from "@/shared/ui/Feedback";

interface StateDraft {
  revision: string;
  goal: string;
  nextAction: string;
  active: string;
  blocked: string;
  questions: string;
}

function draftFrom(state: ProjectState): StateDraft {
  return {
    revision: state.revision,
    goal: state.goal,
    nextAction: state.nextAction,
    active: state.active.join("\n"),
    blocked: state.blocked.join("\n"),
    questions: state.openQuestions.join("\n"),
  };
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function patchFrom(draft: StateDraft): ProjectStatePatch {
  return {
    goal: draft.goal.trim(),
    nextAction: draft.nextAction.trim(),
    active: lines(draft.active),
    blocked: lines(draft.blocked),
    openQuestions: lines(draft.questions),
  };
}

function isDirty(state: ProjectState, draft: StateDraft): boolean {
  const patch = patchFrom(draft);
  return (
    patch.goal !== state.goal ||
    patch.nextAction !== state.nextAction ||
    (patch.active ?? []).join("\n") !== state.active.join("\n") ||
    (patch.blocked ?? []).join("\n") !== state.blocked.join("\n") ||
    (patch.openQuestions ?? []).join("\n") !== state.openQuestions.join("\n")
  );
}

export const ProjectDetailPage = observer(function ProjectDetailPage({
  projects,
  memory,
  engine,
}: {
  projects: ProjectsStore;
  memory: MemoryStore;
  engine: EngineStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const { projectId = "" } = useParams<{ projectId: string }>();
  const project = projects.items.find((item) => item.id === projectId) ?? null;
  const state =
    projects.stateProjectId === projectId ? projects.state : null;
  const [draft, setDraft] = useState<StateDraft | null>(() =>
    state ? draftFrom(state) : null,
  );
  const recent =
    memory.recentProjectId === projectId ? memory.recentItems : [];
  const handoff =
    memory.recentProjectId === projectId ? memory.latestHandoff : null;

  useEffect(() => {
    void projects.load().then(() => {
      if (projectId) {
        projects.select(projectId);
      }
    });
  }, [projectId, projects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    memory.setProject(projectId);
    if (engine.isRunning) {
      void projects.loadState(projectId);
      void memory.loadProjectSummary(projectId);
    }
  }, [engine.isRunning, memory, projectId, projects]);

  useEffect(() => {
    if (state) {
      setDraft(draftFrom(state));
    } else {
      setDraft(null);
    }
  }, [state?.projectId, state?.revision]);

  const save = async (): Promise<void> => {
    if (!draft) {
      return;
    }
    const result = await projects.saveState(projectId, patchFrom(draft));
    if (result === "saved") {
      notify(t("projectDetail.saved"), "success");
    }
  };

  if (!projects.loaded && projects.loading) {
    return (
      <div className="page">
        <Loading label={t("projects.title")} />
      </div>
    );
  }

  if (projects.loaded && !project) {
    return (
      <div className="page">
        <EmptyState
          title={t("projectDetail.notFound")}
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
          <Link className="text-link" to="/projects">
            ← {t("nav.projects")}
          </Link>
          <h2>{project?.name || projectId}</h2>
          <p className="muted">{t("projectDetail.subtitle")}</p>
        </div>
        <Button
          disabled={!engine.isRunning}
          onClick={() => {
            void projects.loadState(projectId, { force: true });
            void memory.loadProjectSummary(projectId);
          }}
        >
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

      {projects.stateError ? (
        <Notice
          variant="error"
          action={
            <Button
              variant="link"
              onClick={() => void projects.loadState(projectId, { force: true })}
            >
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{projects.stateError}</span>
        </Notice>
      ) : null}

      {projects.stateConflict ? (
        <Notice
          variant="error"
          action={<Button variant="link" onClick={projects.clearConflict}>{t("actions.dismiss")}</Button>}
        >
          <span>
            {projects.conflictRevision
              ? t("projectDetail.conflict", {
                  revision: projects.conflictRevision,
                })
              : t("projectDetail.conflictUnknown")}
          </span>
        </Notice>
      ) : projects.saveError ? (
        <Notice
          variant="error"
          action={<Button variant="link" onClick={projects.clearConflict}>{t("actions.dismiss")}</Button>}
        >
          <span>{t("projectDetail.saveError")}</span>
        </Notice>
      ) : null}

      <Card>
        <div className="card-header">
          <div>
            <h3>{t("projectDetail.state")}</h3>
            <p className="muted small">
              {state
                ? `${t("projectDetail.revision", { revision: state.revision.slice(0, 8) })}${
                    state.updatedAt
                      ? ` · ${formatDateTime(state.updatedAt, locale)}`
                      : ""
                  }`
                : t("common.none")}
            </p>
          </div>
        </div>
        {!projects.stateLoaded && projects.stateLoading ? (
          <Loading label={t("projectDetail.state")} />
        ) : draft ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="field">
              <span>{t("projectDetail.goal")}</span>
              <textarea
                className="input"
                rows={2}
                value={draft.goal}
                onChange={(event) =>
                  setDraft({ ...draft, goal: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>{t("projectDetail.nextAction")}</span>
              <textarea
                className="input"
                rows={2}
                value={draft.nextAction}
                onChange={(event) =>
                  setDraft({ ...draft, nextAction: event.target.value })
                }
              />
            </label>
            <div className="form-grid">
              <label className="field">
                <span>{t("projectDetail.active")}</span>
                <textarea
                  className="input"
                  rows={4}
                  value={draft.active}
                  onChange={(event) =>
                    setDraft({ ...draft, active: event.target.value })
                  }
                />
                <small>{t("projectDetail.linesHint")}</small>
              </label>
              <label className="field">
                <span>{t("projectDetail.blocked")}</span>
                <textarea
                  className="input"
                  rows={4}
                  value={draft.blocked}
                  onChange={(event) =>
                    setDraft({ ...draft, blocked: event.target.value })
                  }
                />
                <small>{t("projectDetail.linesHint")}</small>
              </label>
              <label className="field">
                <span>{t("projectDetail.questions")}</span>
                <textarea
                  className="input"
                  rows={4}
                  value={draft.questions}
                  onChange={(event) =>
                    setDraft({ ...draft, questions: event.target.value })
                  }
                />
                <small>{t("projectDetail.linesHint")}</small>
              </label>
            </div>
            <div className="form-actions">
              <Button
                variant="primary"
                type="submit"
                loading={projects.saving}
                disabled={!engine.isRunning || !state || !isDirty(state, draft)}
              >
                {projects.saving ? t("projectDetail.saving") : t("projectDetail.save")}
              </Button>
              <Button
                type="button"
                disabled={!state || !isDirty(state, draft) || projects.saving}
                onClick={() => state && setDraft(draftFrom(state))}
              >
                {t("common.cancel")}
              </Button>
              {state && isDirty(state, draft) ? (
                <span className="muted small">{t("projectDetail.dirty")}</span>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="muted">{t("common.none")}</p>
        )}
      </Card>

      <div className="project-grid">
        <Card>
          <div className="card-header">
            <h3>{t("projectDetail.latestHandoff")}</h3>
          </div>
          {memory.recentLoading ? (
            <Loading label={t("projectDetail.latestHandoff")} />
          ) : handoff ? (
            <>
              <Link
                className="table-link"
                to={`/memory/${handoff.kind}/${encodeURIComponent(handoff.id)}`}
              >
                {handoff.title}
              </Link>
              <p className="muted small">
                {handoff.updatedAt
                  ? formatDateTime(handoff.updatedAt, locale)
                  : t("common.none")}
              </p>
            </>
          ) : (
            <p className="muted">{t("projectDetail.noHandoff")}</p>
          )}
          <h4>{t("projectDetail.cli")}</h4>
          <code>brain open {projectId}</code>
        </Card>

        <Card>
          <div className="card-header">
            <h3>{t("projectDetail.recent")}</h3>
          </div>
          {memory.recentError ? (
            <Notice variant="error">
              <span>{memory.recentError}</span>
            </Notice>
          ) : memory.recentLoading ? (
            <Loading label={t("projectDetail.recent")} />
          ) : recent.length === 0 ? (
            <p className="muted">{t("projectDetail.noRecent")}</p>
          ) : (
            <Table caption={t("projectDetail.recent")}>
              <thead>
                <tr>
                  <th scope="col">{t("common.name")}</th>
                  <th scope="col">{t("common.kind")}</th>
                  <th scope="col">{t("common.updated")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((record) => (
                  <tr key={record.id}>
                    <td data-label={t("common.name")}>
                      <Link
                        className="table-link"
                        to={`/memory/${record.kind}/${encodeURIComponent(record.id)}`}
                      >
                        {record.title}
                      </Link>
                    </td>
                    <td data-label={t("common.kind")}>
                      <RecordKindBadge kind={record.kind} />
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
          )}
        </Card>
      </div>
    </div>
  );
});
