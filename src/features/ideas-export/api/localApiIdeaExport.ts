import {
  ideasApi,
  type IdeaIcalRequest,
} from "@/entities/ideas/api/ideasApi";
import type { IdeaExportSource } from "../model/types";

/**
 * The visible list filters the local API can express for `/v1/ideas/ical`.
 * The export must follow `ideas.scoped`: a project-scoped page exports only
 * that project. Free-text search is UI-only and cannot narrow the `.ics`
 * route, so the button exports the date range of the scoped list.
 */
export interface IdeaExportScope {
  /** Omitted exports every registered project. */
  projectId?: string;
  /** Done ideas stay out by default, matching the calendar's open rows. */
  includeDone?: boolean;
}

/** The subset of the ideas store the export reads at call time. */
export interface IdeasExportScopeState {
  scope: "all" | "project";
  projectId: string | null;
}

export interface IdeaIcalSource {
  ical(request?: IdeaIcalRequest): Promise<string>;
}

/** Maps the page's scope selector to the export request. */
export function ideaExportScope(
  state: IdeasExportScopeState,
): IdeaExportScope {
  return {
    projectId:
      state.scope === "project" ? (state.projectId ?? undefined) : undefined,
  };
}

/**
 * WS7 real source for the WS9 `IdeasPage` `exportSource` prop. The scope is a
 * getter so an export follows the current project selection instead of a
 * snapshot taken when the page mounted.
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
      });
    },
  };
}
