export interface GitSyncRevision {
  kind: string;
  value: string;
  at: string;
}

export interface GitSyncStatus {
  provider: string;
  branch: string;
  ahead: number;
  behind: number;
  changed: number;
  dirty: boolean;
  unmerged: boolean;
  conflicts: string[];
  conflictRecords: string[];
  recovered: boolean;
  reindexed: boolean;
  lastSynced: GitSyncRevision | null;
}
