import { apiClient, toApiError } from "@/shared/api/client";
import type { JournalEntry } from "@/entities/memory/model/types";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptionalString,
  asString,
  asStringMap,
  asTimestamp,
} from "@/shared/api/validate";

export interface JournalPage {
  items: JournalEntry[];
  limit: number;
  hasMore: boolean;
}

export interface JournalSource {
  read(projectId: string | null, limit: number): Promise<JournalPage>;
}

export const journalApi: JournalSource = {
  async read(projectId, limit) {
    const { data, error, response } = await apiClient.GET("/v1/journal", {
      params: { query: { project: projectId ?? undefined, limit } },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseJournalPage(data);
  },
};

export function parseJournalPage(value: unknown): JournalPage {
  const page = asObject(value, "journal");
  return {
    items: asArray(page.items, "journal.items", parseJournalEntry),
    limit: asNumber(page.limit, "journal.limit"),
    hasMore: asBoolean(page.has_more, "journal.has_more"),
  };
}

export function parseJournalEntry(value: unknown, what: string): JournalEntry {
  const entry = asObject(value, what);
  return {
    time: asTimestamp(entry.time, `${what}.time`),
    event: asString(entry.event, `${what}.event`),
    project: asOptionalString(entry.project, `${what}.project`),
    id: asOptionalString(entry.id, `${what}.id`),
    title: asOptionalString(entry.title, `${what}.title`),
    fields:
      entry.fields === undefined || entry.fields === null
        ? undefined
        : asStringMap(entry.fields, `${what}.fields`),
  };
}
