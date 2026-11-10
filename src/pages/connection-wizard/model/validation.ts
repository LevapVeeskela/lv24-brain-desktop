import type { ProviderDescriptor } from "@/entities/provider/model/types";

export type ScheduleChoice = "manual" | "@hourly" | "@daily" | "custom";

/** Same contract the engine enforces for connection ids. */
export const connectionIdPattern =
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export interface WizardValidationInput {
  id: string;
  provider: ProviderDescriptor;
  settings: Record<string, string>;
  secrets: Record<string, string>;
  oauth: boolean;
  schedule: ScheduleChoice;
  customSchedule: string;
}

export interface WizardValidation {
  valid: boolean;
  id: "empty" | "invalid" | null;
  missingSettings: string[];
  missingSecrets: string[];
  customScheduleInvalid: boolean;
}

/**
 * Validation is explicit instead of disabling the submit button: keeping the
 * primary action enabled lets a click/Enter explain what still needs input.
 */
export function validateWizard(
  input: WizardValidationInput,
): WizardValidation {
  const id = input.id.trim();
  const idState =
    id === "" ? "empty" : connectionIdPattern.test(id) ? null : "invalid";

  const missingSettings = input.provider.configFields
    .filter((field) => !field.secret && field.required)
    .filter((field) => !input.settings[field.key]?.trim())
    .map((field) => field.key);

  const missingSecrets = input.oauth
    ? []
    : input.provider.configFields
        .filter((field) => field.secret && field.required)
        .filter((field) => !input.secrets[field.key]?.trim())
        .map((field) => field.key);

  const customScheduleInvalid =
    input.schedule === "custom" && input.customSchedule.trim() === "";

  return {
    valid:
      idState === null &&
      missingSettings.length === 0 &&
      missingSecrets.length === 0 &&
      !customScheduleInvalid,
    id: idState,
    missingSettings,
    missingSecrets,
    customScheduleInvalid,
  };
}
