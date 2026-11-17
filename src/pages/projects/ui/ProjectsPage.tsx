import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Table } from "@/shared/ui/Table";
import { useI18n } from "@/shared/i18n";

export const ProjectsPage = observer(function ProjectsPage({
  projects,
}: {
  projects: ProjectsStore;
}) {
  const { t } = useI18n();

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("projects.title")}</h2>
          <p className="muted">{t("projects.subtitle")}</p>
        </div>
        <Button
          variant="primary"
          disabled={projects.loading}
          onClick={() => void projects.load(true)}
        >
          {projects.loading ? t("common.loading") : t("actions.refresh")}
        </Button>
      </div>

      {projects.error ? <Notice variant="error" action={<Button variant="link" disabled={projects.loading} onClick={() => void projects.load(true)}>{t("actions.retry")}</Button>}><span>{projects.error}</span></Notice> : null}

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
                  <tr key={project.id}>
                    <td data-label={t("projects.id")}>
                      <code>{project.id}</code>
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
    </div>
  );
});
