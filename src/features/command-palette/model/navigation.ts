import type { MessageKey } from "@/shared/i18n";

export interface PaletteAction {
  id: string;
  label: string;
  to: string;
  keywords: string[];
}

export function navigationActions(
  t: (key: MessageKey) => string,
  projectId: string | null,
): PaletteAction[] {
  const actions: PaletteAction[] = [
    { id: "dashboard", label: t("nav.dashboard"), to: "/", keywords: ["home", "overview", "dashboard"] },
    { id: "memory", label: t("nav.memory"), to: "/memory", keywords: ["records", "memory", "notes", "decisions"] },
    { id: "inbox", label: t("nav.inbox"), to: "/inbox", keywords: ["review", "proposals", "inbox"] },
    { id: "search", label: t("nav.search"), to: "/search", keywords: ["find", "search", "query"] },
    { id: "projects", label: t("nav.projects"), to: "/projects", keywords: ["projects", "state"] },
    { id: "activity", label: t("nav.activity"), to: "/activity", keywords: ["runs", "activity", "log"] },
    { id: "connections", label: t("nav.connections"), to: "/connections", keywords: ["sources", "connections", "github"] },
    { id: "settings", label: t("nav.settings"), to: "/settings", keywords: ["preferences", "settings"] },
  ];
  if (projectId) {
    actions.splice(5, 0, {
      id: "project",
      label: t("projectDetail.title"),
      to: `/projects/${encodeURIComponent(projectId)}`,
      keywords: [projectId, "project", "state"],
    });
  }
  return actions;
}

export function filterActions(
  actions: readonly PaletteAction[],
  query: string,
): PaletteAction[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...actions];
  }
  return actions.filter((action) =>
    [action.label, ...action.keywords].some((value) =>
      value.toLowerCase().includes(needle),
    ),
  );
}
