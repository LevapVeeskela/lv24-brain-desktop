import { NavLink } from "react-router-dom";
import { useI18n, type MessageKey } from "@/shared/i18n";

const links: Array<{ to: string; key: MessageKey; end?: boolean; icon: string }> = [
  { to: "/", key: "nav.dashboard", end: true, icon: "M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z" },
  { to: "/connections", key: "nav.connections", icon: "M8 8l8 8 M7 12a5 5 0 115-5 M12 17a5 5 0 115-5" },
  { to: "/activity", key: "nav.activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { to: "/projects", key: "nav.projects", icon: "M3 7V4h7l2 3h9v13H3z" },
  { to: "/settings", key: "nav.settings", icon: "M5 3v18 M12 3v18 M19 3v18 M2 8h6 M9 16h6 M16 9h6" },
];

export function AppNav() {
  const { t } = useI18n();
  return (
    <nav className="app-nav" aria-label={t("app.title")}>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            `app-nav__link ${isActive ? "active" : ""}`.trim()
          }
        >
          <svg className="app-nav__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={link.icon} /></svg>
          {t(link.key)}
        </NavLink>
      ))}
    </nav>
  );
}
