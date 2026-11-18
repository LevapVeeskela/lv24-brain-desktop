import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Table } from "@/shared/ui/Table";
import { useFeedback } from "@/shared/ui/Feedback";
import { useI18n, type MessageKey } from "@/shared/i18n";

const stateKeys: Record<string, MessageKey> = {
  owned: "projects.state.owned",
  stamped: "projects.state.stamped",
  missing: "projects.state.missing",
};

export const ProjectsPage = observer(function ProjectsPage({
  projects,
}: {
  projects: ProjectsStore;
}) {
  const { t } = useI18n();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [newPath, setNewPath] = useState("");
  const selectedParam = searchParams.get("project") ?? projects.selectedId;
  const adoptReport = projects.adoptPreview ?? projects.adoptApplied;

  const detailPath = (projectId: string): string => {
    const base = `/projects/${encodeURIComponent(projectId)}`;
    return selectedParam
      ? `${base}?project=${encodeURIComponent(selectedParam)}`
      : base;
  };

  const openRow = (
    event: MouseEvent<HTMLTableRowElement>,
    projectId: string,
  ): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea, label")) {
      return;
    }
    navigate(detailPath(projectId));
  };

  const machinePaths = new Map<string, number>();
  for (const project of projects.items) {
    for (const path of project.paths) {
      const machine = project.pathProvenance[path];
      if (machine) {
        machinePaths.set(machine, (machinePaths.get(machine) ?? 0) + 1);
      }
    }
  }

  useEffect(() => {
    void projects.load();
  }, [projects]);

  const applyAdopt = async (): Promise<void> => {
    const applied = await projects.applyAdopt();
    setAdoptOpen(false);
    notify(
      applied
        ? t("projects.adoptDone", { count: applied.stamped })
        : t("projects.adoptFailed"),
      applied ? "success" : "error",
    );
  };

  const submitPath = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const projectId = projects.selected?.id;
    const path = newPath.trim();
    if (!projectId || !path) {
      return;
    }
    const added = await projects.addPath(projectId, path);
    if (!added) {
      notify(t("projects.addPathFailed"), "error");
      return;
    }
    setNewPath("");
    notify(t("projects.addPathDone"), "success");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("projects.title")}</h2>
          <p className="muted">{t("projects.subtitle")}</p>
        </div>
        <div className="row-actions">
          <Button
            disabled={projects.adoptLoading}
            onClick={() => void projects.previewAdopt()}
          >
            {projects.adoptLoading
              ? t("common.loading")
              : t("projects.adopt")}
          </Button>
          <Button
            variant="primary"
            disabled={projects.loading}
            onClick={() => void projects.load(true)}
          >
            {projects.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
        </div>
      </div>

      {projects.error ? <Notice variant="error" action={<Button variant="link" disabled={projects.loading} onClick={() => void projects.load(true)}>{t("actions.retry")}</Button>}><span>{projects.error}</span></Notice> : null}

      {projects.adoptError ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={projects.dismissError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{projects.adoptError}</span>
        </Notice>
      ) : null}

      {adoptReport ? (
        <Card>
          <div className="card-header">
            <div>
              <h3>{t("projects.adoptPreview")}</h3>
              <p className="muted small">{t("projects.adoptHint")}</p>
            </div>
            {projects.adoptPreview ? (
              <Button
                variant="primary"
                disabled={
                  projects.adoptLoading || projects.adoptPreview.stamped === 0
                }
                onClick={() => setAdoptOpen(true)}
              >
                {t("projects.adoptApply", {
                  count: projects.adoptPreview.stamped,
                })}
              </Button>
            ) : null}
          </div>
          <p className="muted small">
            {t("projects.adoptMachine")}: <code>{adoptReport.machine}</code>
          </p>
          <div className="badge-row">
            <Badge tone="info">
              {t("projects.adoptStamped", { count: adoptReport.stamped })}
            </Badge>
            <Badge tone="success">
              {t("projects.adoptOwned", { count: adoptReport.owned })}
            </Badge>
            <Badge tone="warning">
              {t("projects.adoptMissing", { count: adoptReport.missing })}
            </Badge>
          </div>
          {adoptReport.projects.length === 0 ? (
            <p className="muted">{t("projects.adoptEmpty")}</p>
          ) : (
            <ul className="plain-list">
              {adoptReport.projects.map((entry) => (
                <li key={entry.projectId}>
                  <strong>{entry.projectId}</strong>
                  <ul className="plain-list">
                    {entry.paths.map((path) => (
                      <li key={path.path}>
                        <code>{path.path}</code>{" "}
                        <Badge tone={path.state === "missing" ? "warning" : "neutral"}>
                          {stateKeys[path.state]
                            ? t(stateKeys[path.state])
                            : path.state}
                        </Badge>
                        {path.machine ? (
                          <span className="muted small"> · {path.machine}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <ConfirmDialog
        open={adoptOpen}
        title={t("projects.adoptConfirmTitle")}
        confirmLabel={t("projects.adoptApply", {
          count: projects.adoptPreview?.stamped ?? 0,
        })}
        cancelLabel={t("common.cancel")}
        busy={projects.adoptLoading}
        onConfirm={() => void applyAdopt()}
        onCancel={() => setAdoptOpen(false)}
      >
        <p>{t("projects.adoptConfirmBody")}</p>
        <p className="muted small">
          {t("projects.adoptConfirmCounts", {
            count: projects.adoptPreview?.stamped ?? 0,
          })}
        </p>
      </ConfirmDialog>

      <Card>
        {!projects.loaded && !projects.error ? (
          <Loading label={`${t("common.loading")} ${t("projects.title")}`} />
        ) : projects.loaded && projects.items.length === 0 ? (
          <EmptyState title={t("projects.empty")} hint={t("projects.subtitle")} action={<Link className="text-link" to="/connections">{t("nav.connections")}</Link>} />
        ) : projects.items.length > 0 ? (
            <Table caption={t("projects.subtitle")}>
              <thead>
                <tr>
                  <th scope="col">{t("projects.id")}</th>
                  <th scope="col">{t("common.name")}</th>
                  <th scope="col">{t("projects.paths")}</th>
                </tr>
              </thead>
              <tbody>
                {projects.items.map((project) => (
                  <tr
                    key={project.id}
                    className="is-link-row"
                    onClick={(event) => openRow(event, project.id)}
                  >
                    <td data-label={t("projects.id")}>
                      <Link
                        className="table-link"
                        to={detailPath(project.id)}
                      >
                        <code>{project.id}</code>
                      </Link>
                    </td>
                    <td data-label={t("common.name")}>{project.name || t("common.none")}</td>
                    <td data-label={t("projects.paths")}>
                      {project.paths.length > 0 ? (
                        <ul className="plain-list">
                          {project.paths.map((path) => {
                            const machine = project.pathProvenance[path];
                            return (
                              <li key={path}>
                                <code>{path}</code>
                                {machine ? (
                                  <span className="muted small"> · {machine}</span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        t("common.none")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
        ) : null}
      </Card>

      {machinePaths.size > 0 ? (
        <Card>
          <h3>{t("projects.machineProvenance")}</h3>
          <ul className="plain-list">
            {[...machinePaths.entries()].map(([machine, count]) => (
              <li key={machine}>
                <strong>{machine}</strong>
                <span className="muted">
                  {" "}— {t("projects.machinePaths", { count })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {projects.selected ? (
        <Card>
          <h3>{t("projects.addPath")}</h3>
          <p className="muted small">
            <code>{projects.selected.id}</code>
          </p>
          <form noValidate onSubmit={(event) => void submitPath(event)}>
            <Field
              id="project-add-path"
              label={t("projects.addPathLabel")}
              hint={t("projects.addPathHint")}
            >
              <Input
                id="project-add-path"
                value={newPath}
                placeholder={"C:\\0project\\lv24"}
                onChange={(event) => setNewPath(event.target.value)}
              />
            </Field>
            {projects.addPathError ? (
              <Notice variant="error">
                <span>{projects.addPathError}</span>
              </Notice>
            ) : null}
            <div className="form-actions">
              <Button
                type="submit"
                variant="primary"
                disabled={!newPath.trim() || projects.addingPath}
              >
                {projects.addingPath
                  ? t("common.loading")
                  : t("projects.addPathSubmit")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
});
