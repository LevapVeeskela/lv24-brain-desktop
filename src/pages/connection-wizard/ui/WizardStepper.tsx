import { useI18n } from "@/shared/i18n";
import { canReturnToStep, wizardSteps, type WizardStep } from "../model/steps";

interface WizardStepperProps {
  current: WizardStep;
  hasDraft: boolean;
  created: boolean;
  busy: boolean;
  onGo: (step: WizardStep) => void;
}

export function WizardStepper({ current, hasDraft, created, busy, onGo }: WizardStepperProps) {
  const { t } = useI18n();
  const currentIndex = wizardSteps.indexOf(current);
  return (
    <ol className="steps" aria-label={t("wizard.title")}>
      {wizardSteps.map((step, index) => {
        const complete = index < currentIndex;
        const canGo = canReturnToStep(current, step, hasDraft, created, busy);
        const content = <><span aria-hidden="true">{complete ? "✓" : index + 1}</span>{t(`wizard.step.${step}`)}</>;
        return (
          <li key={step} className={`step ${current === step ? "active" : complete ? "step-complete" : "step-upcoming"}`} aria-current={current === step ? "step" : undefined}>
            {canGo ? <button type="button" className="step-link" onClick={() => onGo(step)}>{content}</button> : content}
          </li>
        );
      })}
    </ol>
  );
}
