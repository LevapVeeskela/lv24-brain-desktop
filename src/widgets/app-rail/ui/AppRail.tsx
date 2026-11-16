import { observer } from "mobx-react-lite";
import { NavLink } from "react-router-dom";
import type { RootStore } from "@/app/model/RootStore";
import { useI18n, type MessageKey } from "@/shared/i18n";

const primaryLinks: Array<{
  to: string;
  key: MessageKey;
  end?: boolean;
  icon: string;
}> = [
  {
    to: "/",
    key: "nav.dashboard",
    end: true,
    icon: "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z",
  },
  {
    to: "/memory",
    key: "nav.memory",
    icon: "M12 3l9 5-9 5-9-5 9-5 M3 12l9 5 9-5 M3 16l9 5 9-5",
  },
  {
    to: "/inbox",
    key: "nav.inbox",
    icon: "M3 5h18v14H3z M3 12h5l2 3h4l2-3h5",
  },
  {
    to: "/search",
    key: "nav.search",
    icon: "M11 4a7 7 0 105 12 M16 16l5 5",
  },
  {
    to: "/projects",
    key: "nav.projects",
    icon: "M3 7V4h7l2 3h9v13H3z",
  },
  {
    to: "/activity",
    key: "nav.activity",
    icon: "M3 12h4l3-8 4 16 3-8h4",
  },
  {
    to: "/connections",
    key: "nav.connections",
    icon: "M8 8l8 8 M7 12a5 5 0 115-5 M12 17a5 5 0 115-5",
  },
];

export const AppRail = observer(function AppRail({ store }: { store: RootStore }) {
  const { t } = useI18n();
  const projects = store.projects;
  const pending = store.review.pendingCount;

  return (
    <aside className="app-rail" aria-label={t("shell.navLabel")}>
      <div className="rail-project">
        <label className="rail-project-label" htmlFor="rail-project">
          {t("shell.project")}
        </label>
        <select
          id="rail-project"
          className="input"
          value={projects.selectedId ?? ""}
          disabled={projects.items.length === 0}
          onChange={(event) => projects.select(event.target.value || null)}
        >
          {projects.loading && projects.items.length === 0 ? (
            <option value="">{t("common.loading")}</option>
          ) : projects.items.length === 0 ? (
            <option value="">{t("shell.projectNone")}</option>
          ) : null}
          {projects.items.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name || project.id}
            </option>
          ))}
        </select>
      </div>

      <nav className="rail-nav" aria-label={t("shell.navLabel")}>
        {primaryLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `rail-link ${isActive ? "active" : ""}`.trim()
            }
          >
            <svg
              className="rail-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={link.icon} />
            </svg>
            <span>{t(link.key)}</span>
            {link.to === "/inbox" && pending > 0 ? (
              <>
                <span className="rail-badge" aria-hidden="true">
                  {pending}
                </span>
                <span className="sr-only">
                  {t("shell.inboxBadge", { count: pending })}
                </span>
              </>
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className="rail-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `rail-link ${isActive ? "active" : ""}`.trim()
          }
        >
          <svg
            className="rail-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 9h6" />
          </svg>
          <span>{t("nav.settings")}</span>
        </NavLink>
      </div>
    </aside>
  );
});
