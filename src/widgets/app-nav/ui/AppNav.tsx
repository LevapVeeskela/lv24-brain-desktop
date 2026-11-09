import { NavLink } from "react-router-dom";
import { useI18n, type MessageKey } from "@/shared/i18n";

const links: Array<{ to: string; key: MessageKey; end?: boolean }> = [
  { to: "/", key: "nav.dashboard", end: true },
  { to: "/connections", key: "nav.connections" },
  { to: "/activity", key: "nav.activity" },
  { to: "/projects", key: "nav.projects" },
  { to: "/settings", key: "nav.settings" },
];

export function AppNav() {
  const { t } = useI18n();
  return (
    <nav className="app-nav">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            `app-nav__link ${isActive ? "active" : ""}`.trim()
          }
        >
          {t(link.key)}
        </NavLink>
      ))}
    </nav>
  );
}
