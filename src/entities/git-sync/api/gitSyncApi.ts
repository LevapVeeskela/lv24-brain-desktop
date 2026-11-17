import { apiClient, toApiError } from "@/shared/api/client";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptionalString,
  asOptionalTimestamp,
  asString,
} from "@/shared/api/validate";
import type { GitSyncRevision, GitSyncStatus } from "../model/types";

export interface GitSyncSource {
  status(): Promise<GitSyncStatus>;
  sync(push: boolean): Promise<GitSyncStatus>;
}

export const gitSyncApi: GitSyncSource = {
  async status(): Promise<GitSyncStatus> {
    const { data, error, response } = await apiClient.GET("/v1/sync");
    if (error) {
      throw toApiError(response, error);
    }
    return parseSyncStatus(data);
  },

  async sync(push: boolean): Promise<GitSyncStatus> {
    const { data, error, response } = await apiClient.POST("/v1/sync", {
      body: { push },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseSyncStatus(data);
  },
};

export function parseSyncStatus(value: unknown): GitSyncStatus {
  const data = asObject(value, "sync");
  const revision = data.last_synced_revision;
  return {
    provider: asOptionalString(data.provider, "sync.provider") ?? "",
    branch: asOptionalString(data.branch, "sync.branch") ?? "",
    ahead: asNumber(data.ahead, "sync.ahead"),
    behind: asNumber(data.behind, "sync.behind"),
    changed: asNumber(data.changed, "sync.changed"),
    dirty: asBoolean(data.dirty, "sync.dirty"),
    unmerged: asBoolean(data.unmerged, "sync.unmerged"),
    conflicts: asArray(data.conflicts, "sync.conflicts", asString),
    conflictRecords: asArray(
      data.conflict_records,
      "sync.conflict_records",
      asString,
    ),
    recovered: asBoolean(data.recovered, "sync.recovered"),
    reindexed: asBoolean(data.reindexed, "sync.reindexed"),
    lastSynced:
      revision === undefined || revision === null
        ? null
        : parseRevision(revision),
  };
}

function parseRevision(value: unknown): GitSyncRevision {
  const revision = asObject(value, "sync.last_synced_revision");
  return {
    kind: asString(revision.kind, "sync.last_synced_revision.kind"),
    value: asString(revision.value, "sync.last_synced_revision.value"),
    at:
      asOptionalTimestamp(
        revision.at,
        "sync.last_synced_revision.at",
      ) ?? "",
  };
}
