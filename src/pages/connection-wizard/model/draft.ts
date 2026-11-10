import type {
  AuthMode,
  ProviderPublishPolicy,
} from "@/entities/provider/model/types";
import type { ScheduleChoice } from "./validation";

export interface WizardDraft {
  id: string;
  account: string;
  baseUrl: string;
  authMode: AuthMode;
  backend: string;
  schedule: ScheduleChoice;
  customSchedule: string;
  publish: ProviderPublishPolicy;
  selectedProjects: string[];
  settings: Record<string, string>;
  secrets: Record<string, string>;
}

function cloneDraft(draft: WizardDraft): WizardDraft {
  return {
    ...draft,
    selectedProjects: [...draft.selectedProjects],
    settings: { ...draft.settings },
    secrets: { ...draft.secrets },
  };
}

/**
 * Per-provider drafts keep typed settings and secrets when the user goes back
 * to the provider list and picks the same provider again. Drafts live in
 * memory only and never leave the wizard.
 */
export class ProviderDrafts {
  private readonly drafts = new Map<string, WizardDraft>();

  read(provider: string): WizardDraft | undefined {
    const draft = this.drafts.get(provider);
    return draft ? cloneDraft(draft) : undefined;
  }

  write(provider: string, draft: WizardDraft): void {
    this.drafts.set(provider, cloneDraft(draft));
  }

  delete(provider: string): void {
    this.drafts.delete(provider);
  }

  get size(): number {
    return this.drafts.size;
  }
}
