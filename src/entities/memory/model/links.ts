import type { RecordKind } from "./types";

/**
 * Record detail path. The project is kept in the query string so an
 * all-projects listing or search opens the record in its own project instead
 * of the shell's selected project.
 */
export function recordPath(
  kind: RecordKind,
  id: string,
  projectId?: string | null,
): string {
  const path = `/memory/${kind}/${encodeURIComponent(id)}`;
  return projectId ? `${path}?project=${encodeURIComponent(projectId)}` : path;
}
