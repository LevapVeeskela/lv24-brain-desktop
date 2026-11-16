import { makeAutoObservable, runInAction } from "mobx";
import { LocalApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import type { MemorySource } from "../api/memoryApi";
import type { RecordDetail, RecordEditPatch, RecordKind } from "./types";

export interface RecordEditorSnapshot {
  title: string;
  body: string;
  tags: string;
}

/**
 * Draft state for the record edit form. The stored revision read with the
 * record is sent as `expected_updated_at`, so a concurrent write is a typed
 * conflict instead of a silent overwrite.
 */
export class RecordEditor {
  open = false;
  projectId: string | null = null;
  recordId: string | null = null;
  kind: RecordKind | null = null;

  title = "";
  body = "";
  tags = "";

  saving = false;
  error: string | null = null;
  conflict = false;
  duplicate = false;
  limitExceeded = false;

  private baseline: RecordEditorSnapshot = { title: "", body: "", tags: "" };
  private expectedUpdatedAt: string | undefined;
  private allowDuplicate = false;
  private readonly api: MemorySource;
  private readonly onSaved: (detail: RecordDetail) => void;

  constructor(api: MemorySource, onSaved: (detail: RecordDetail) => void) {
    this.api = api;
    this.onSaved = onSaved;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get dirty(): boolean {
    return (
      this.title !== this.baseline.title ||
      this.body !== this.baseline.body ||
      this.tags !== this.baseline.tags
    );
  }

  get tagsDirty(): boolean {
    return this.tags !== this.baseline.tags;
  }

  get canSave(): boolean {
    return this.open && this.dirty && !this.saving;
  }

  get canEditTitle(): boolean {
    return this.kind !== "handoff";
  }

  /** Opens the form for one record and captures its current revision. */
  openFor(detail: RecordDetail): void {
    this.open = true;
    this.projectId = detail.projectId;
    this.recordId = detail.id;
    this.kind = detail.kind;
    this.title = detail.title;
    this.body = detail.body;
    this.tags = "";
    this.baseline = {
      title: detail.title,
      body: detail.body,
      tags: "",
    };
    this.expectedUpdatedAt = detail.updatedAt;
    this.saving = false;
    this.error = null;
    this.conflict = false;
    this.duplicate = false;
    this.limitExceeded = false;
    this.allowDuplicate = false;
  }

  close(): void {
    if (this.saving) {
      return;
    }
    this.open = false;
    this.projectId = null;
    this.recordId = null;
    this.kind = null;
    this.title = "";
    this.body = "";
    this.tags = "";
    this.baseline = { title: "", body: "", tags: "" };
    this.expectedUpdatedAt = undefined;
    this.error = null;
    this.conflict = false;
    this.duplicate = false;
    this.limitExceeded = false;
    this.allowDuplicate = false;
  }

  setTitle(value: string): void {
    this.title = value;
  }

  setBody(value: string): void {
    this.body = value;
  }

  setTags(value: string): void {
    this.tags = value;
  }

  async save(): Promise<boolean> {
    if (!this.canSave || !this.projectId || !this.recordId || !this.kind) {
      return false;
    }
    const projectId = this.projectId;
    const recordId = this.recordId;
    const patch = this.buildPatch();
    if (!patch) {
      return false;
    }
    runInAction(() => {
      this.saving = true;
      this.error = null;
      this.conflict = false;
      this.duplicate = false;
      this.limitExceeded = false;
    });
    try {
      const detail = await this.api.editRecord(projectId, recordId, patch);
      runInAction(() => {
        this.baseline = {
          title: detail.title,
          body: detail.body,
          tags: "",
        };
        this.title = detail.title;
        this.body = detail.body;
        this.tags = "";
        this.expectedUpdatedAt = detail.updatedAt;
        this.allowDuplicate = false;
        this.open = false;
        this.projectId = null;
        this.recordId = null;
        this.kind = null;
      });
      this.onSaved(detail);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
        this.conflict =
          cause instanceof LocalApiError &&
          cause.status === 409 &&
          cause.code === "conflict";
        this.duplicate =
          cause instanceof LocalApiError &&
          cause.status === 409 &&
          cause.code === "duplicate";
        this.limitExceeded =
          cause instanceof LocalApiError &&
          (cause.status === 413 || cause.code === "limit_exceeded");
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  /** Retries the same draft after the user accepts an exact duplicate. */
  async saveAsDuplicate(): Promise<boolean> {
    this.allowDuplicate = true;
    this.duplicate = false;
    return this.save();
  }

  /**
   * Re-reads the stored record after a conflict and replaces the draft with
   * the revision on disk. Unsaved text is discarded by design.
   */
  async reload(): Promise<boolean> {
    if (!this.projectId || !this.recordId) {
      return false;
    }
    runInAction(() => {
      this.saving = true;
      this.error = null;
    });
    try {
      const detail = await this.api.getRecord(this.projectId, this.recordId, {
        history: true,
      });
      runInAction(() => {
        this.openFor(detail);
      });
      this.onSaved(detail);
      return true;
    } catch (cause) {
      runInAction(() => {
        this.error = errorMessage(cause);
      });
      return false;
    } finally {
      runInAction(() => {
        this.saving = false;
      });
    }
  }

  private buildPatch(): RecordEditPatch | null {
    const patch: RecordEditPatch = {
      expectedUpdatedAt: this.expectedUpdatedAt,
      allowDuplicate: this.allowDuplicate || undefined,
    };
    if (this.canEditTitle && this.title !== this.baseline.title) {
      patch.title = this.title;
    }
    if (this.body !== this.baseline.body) {
      patch.body = this.body;
    }
    if (this.tagsDirty) {
      patch.tags = this.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
    if (
      patch.title === undefined &&
      patch.body === undefined &&
      patch.tags === undefined
    ) {
      return null;
    }
    return patch;
  }
}
