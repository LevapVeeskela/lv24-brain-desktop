export const wizardSteps = ["provider", "configure", "done"] as const;
export type WizardStep = (typeof wizardSteps)[number];

/** Completed setup is terminal: retries must never create a duplicate. */
export function canReturnToStep(
  current: WizardStep,
  target: WizardStep,
  hasDraft: boolean,
  created: boolean,
  busy: boolean,
): boolean {
  if (busy || created || current === "done" || target === current) return false;
  return target === "provider" || (target === "configure" && hasDraft);
}
