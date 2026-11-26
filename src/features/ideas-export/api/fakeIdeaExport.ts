import type { Idea } from "@/entities/ideas/model/types";
import { buildIdeasIcs } from "../model/ics";
import type { IdeaExportSource } from "../model/types";

export interface FakeIdeaExportOptions {
  /** Injectable clock keeps DTSTAMP and the file name deterministic. */
  now?: () => Date;
  /** Current ideas; the real client will query the API instead. */
  ideas?: () => readonly Idea[];
}

/**
 * Fake `IdeaExportSource` for 1.8: renders the ICS locally from the same
 * objects the page shows. WS7 swaps it for `GET /v1/ideas/ical`.
 */
export function createFakeIdeaExportSource(
  options: FakeIdeaExportOptions = {},
): IdeaExportSource {
  const now = options.now ?? (() => new Date());
  const ideas = options.ideas ?? (() => []);
  return {
    async fetchIcs(): Promise<string> {
      return buildIdeasIcs(ideas(), now());
    },
  };
}
