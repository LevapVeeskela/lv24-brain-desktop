import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { InlineError } from "@/shared/ui/InlineError";
import { useI18n } from "@/shared/i18n";

export const ProjectsPage = observer(function ProjectsPage({
  projects,
}: {
  projects: ProjectsStore;
}) {
  const { t } = useI18n();

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
          variant="secondary"
          disabled={projects.loading}
          onClick={() => void projects.load(true)}
        >
          {projects.loading ? t("common.loading") : t("actions.refresh")}
        </Button>
      </div>

      {projects.error ? <InlineError>{projects.error}</InlineError> : null}

      <Card>
        {!projects.loaded && !projects.error ? (
          <p className="muted" role="status">
            {t("common.loading")}
          </p>
        ) : projects.loaded && projects.items.length === 0 ? (
          <div className="empty-state">
            <strong>{t("projects.empty")}</strong>
            <span>{t("projects.subtitle")}</span>
            <Link className="btn btn-secondary" to="/connections/new">
              {t("connections.add")}
            </Link>
          </div>
        ) : projects.items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("projects.id")}</th>
                  <th>{t("common.name")}</th>
                </tr>
              </thead>
              <tbody>
                {projects.items.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <code>{project.id}</code>
                    </td>
                    <td>{project.name || t("common.none")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
});
