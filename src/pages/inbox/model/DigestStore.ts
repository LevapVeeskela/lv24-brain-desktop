import { makeAutoObservable, runInAction } from "mobx";
import { errorMessage } from "@/shared/lib/errors";
import { digestApi, type DigestSource } from "../api/digestApi";
import type { Digest, DigestProject } from "./digest";

/**
 * Builds the morning digest in two steps: a dry run that only reports counts,
 * then one confirmed write that saves the Markdown file. The write refreshes
 * the preview so the counts reflect the same window.
 */
export class DigestStore {
  report: Digest | null = null;
  loading = false;
  writing = false;
  error: string | null = null;

  private readonly api: DigestSource;
  private token = 0;

  constructor(api: DigestSource = digestApi) {
    this.api = api;
    makeAutoObservable(this, {}, { autoBind: true });
  }

  /** Per-project proposal counts for the loaded digest. */
  get projectCounts(): DigestProject[] {
    return this.report?.projects ?? [];
  }

  get proposedTotal(): number {
    return this.projectCounts.reduce(
      (total, project) => total + project.proposedDecisions.length,
      0,
    );
  }

  async dryRun(projectId: string | null): Promise<Digest | null> {
    if (this.loading || this.writing) {
      return null;
    }
    const token = ++this.token;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const report = await this.api.digest({ project: projectId ?? undefined });
      if (token !== this.token) {
        return null;
      }
      runInAction(() => {
        this.report = report;
      });
      return report;
    } catch (cause) {
      if (token === this.token) {
        runInAction(() => {
          this.error = errorMessage(cause);
        });
      }
      return null;
    } finally {
      if (token === this.token) {
        runInAction(() => {
          this.loading = false;
        });
      }
    }
  }

  /** Writes the digest only after the caller confirms the dry-run preview. */
  async write(projectId: string | null): Promise<Digest | null> {
    if (this.loading || this.writing) {
      return null;
    }
    const token = ++this.token;
    runInAction(() => {
      this.writing = true;
      this.error = null;
    });
    try {
      const report = await this.api.digest({
        project: projectId ?? undefined,
        write: true,
      });
      if (token !== this.token) {
        return null;
      }
      runInAction(() => {
        this.report = report;
      });
      return report;
    } catch (cause) {
      if (token === this.token) {
        runInAction(() => {
          this.error = errorMessage(cause);
        });
      }
      return null;
    } finally {
      if (token === this.token) {
        runInAction(() => {
          this.writing = false;
        });
      }
    }
  }

  clear(): void {
    this.token++;
    this.report = null;
    this.loading = false;
    this.writing = false;
    this.error = null;
  }
}
