import {
  ideasApi,
  type IdeaIcalRequest,
} from "@/entities/ideas/api/ideasApi";
import type { IdeaExportSource } from "../model/types";

/**
 * The visible list filters the local API can express for `/v1/ideas/ical`.
 * The route accepts `project`, `include_done`, `status`, `tags`/`tag` and `q`,
 * so a searched page exports exactly the scoped rows; the date range is not a
 * filter here because the calendar renders every dated idea in the scope.
 */
export interface IdeaExportScope {
  /** Omitted exports every registered project. */
  projectId?: string;
  /** Done ideas stay out by default, matching the calendar's open rows. */
  includeDone?: boolean;
  /** Transient search from the page. */
  query?: string;
  /** Tag chips, when the page offers them; exact case-insensitive AND. */
  tags?: readonly string[];
}

/** The subset of the ideas store the export reads at call time. */
export interface IdeasExportScopeState {
  scope: "all" | "project";
  projectId: string | null;
  query?: string;
  tags?: readonly string[];
}

export interface IdeaIcalSource {
  ical(request?: IdeaIcalRequest): Promise<string>;
}

/** Maps the page's scope selector to the export request. */
export function ideaExportScope(
  state: IdeasExportScopeState,
): IdeaExportScope {
  const query = state.query?.trim();
  return {
    projectId:
      state.scope === "project" ? (state.projectId ?? undefined) : undefined,
    ...(query ? { query } : {}),
    ...(state.tags?.length ? { tags: state.tags } : {}),
  };
}

/**
 * WS7 real source for the WS9 `IdeasPage` `exportSource` prop. The scope is a
 * getter so an export follows the current project selection, search and tags
 * instead of a snapshot taken when the page mounted.
 */
export function createLocalApiIdeaExportSource(
  scope: () => IdeaExportScope,
  api: IdeaIcalSource = ideasApi,
): IdeaExportSource {
  return {
    async fetchIcs(): Promise<string> {
      const current = scope();
      return api.ical({
        projectId: current.projectId,
        includeDone: current.includeDone === true,
        query: current.query,
        tags: current.tags,
      });
    },
  };
}
