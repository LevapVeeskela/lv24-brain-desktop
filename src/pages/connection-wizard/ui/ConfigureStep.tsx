import type { Ref } from "react";
import type { ProviderDescriptor, ProviderPublishPolicy } from "@/entities/provider/model/types";
import type { Project } from "@/entities/project/model/types";
import { useI18n } from "@/shared/i18n";
import { Field, FormRow } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { InlineError } from "@/shared/ui/InlineError";
import { Notice } from "@/shared/ui/Notice";
import type { WizardDraft } from "../model/draft";
import type { ScheduleChoice, WizardValidation } from "../model/validation";

interface ConfigureStepProps {
  provider: ProviderDescriptor;
  draft: WizardDraft;
  formId: string;
  draftRestored: boolean;
  submitCount: number;
  validation: WizardValidation;
  missingLabels: string[];
  busy: boolean;
  engineReady: boolean;
  updating: boolean;
  projects: Project[];
  headingRef: Ref<HTMLHeadingElement>;
  summaryRef: Ref<HTMLDivElement>;
  onDismissDraft: () => void;
  onBack: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<WizardDraft>) => void;
}

export function ConfigureStep({provider, draft, formId, draftRestored, submitCount, validation, missingLabels, busy, engineReady, updating, projects, headingRef, summaryRef, onDismissDraft, onBack, onSubmit, onChange}: ConfigureStepProps) {
  const { t } = useI18n();
  const { id, account, baseUrl, authMode, backend, schedule, customSchedule, publish, selectedProjects, settings, secrets } = draft;
  const oauth = authMode === "oauth-device" || authMode === "oauth-pkce";
  const showValidation = submitCount > 0 && !validation.valid;
  const idError = validation.id === "invalid" || (submitCount > 0 && validation.id === "empty") ? t("wizard.errorId") : null;
  return (
  <>
    {draftRestored ? (
      <Notice
        variant="info"
        action={
          <Button
            variant="link"
            onClick={() => onDismissDraft()}
          >
            {t("actions.dismiss")}
          </Button>
        }
      >
        <span>{t("wizard.draftRestored")}</span>
      </Notice>
    ) : null}

    {/* Keep the focus target mounted after the first submit attempt.
        Otherwise fixing the last invalid field removes the summary while
        it holds focus and drops keyboard users back to the document. */}
    {submitCount > 0 ? (
      <div
        ref={summaryRef}
        id={`${formId}-validation`}
        tabIndex={-1}
      >
        {showValidation ? (
          <Notice variant="error">
            <span>
              {t("wizard.errorRequired", {
                fields: missingLabels.join(", "),
              })}
              <br />
              {t("wizard.errorFields")}
            </span>
          </Notice>
        ) : null}
      </div>
    ) : null}

    <Card>
      <div className="card-header">
        <div>
          <h3 ref={headingRef} tabIndex={-1}>
            {t("wizard.configureTitle", {
              provider: provider.displayName,
            })}
          </h3>
          <p className="muted small">{provider.provider}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onBack}
        >
          {t("common.back")}
        </Button>
      </div>

      <form
        id={`${formId}-form`}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormRow>
          <Field id={`${formId}-id`} label={t("wizard.id")} required hint={t("wizard.idHint")} error={idError ?? undefined}>
            <Input
              id={`${formId}-id`}
              value={id}
              placeholder={`${provider.provider}-main`}
              required
              aria-invalid={idError ? true : undefined}
              aria-describedby={idError ? `${formId}-id-hint ${formId}-id-error` : `${formId}-id-hint`}
              onChange={(event) => onChange({ id: event.target.value })}
            />
          </Field>
          <Field id={`${formId}-account`} label={t("wizard.account")} hint={t("common.optional")}>
            <Input id={`${formId}-account`} value={account} aria-describedby={`${formId}-account-hint`} onChange={(event) => onChange({ account: event.target.value })} />
          </Field>
          <Field id={`${formId}-base-url`} label={t("wizard.baseUrl")} hint={t("common.optional")}>
            <Input id={`${formId}-base-url`} value={baseUrl} aria-describedby={`${formId}-base-url-hint`} onChange={(event) => onChange({ baseUrl: event.target.value })} />
          </Field>

          <div
            className="field"
            role="group"
            aria-label={t("wizard.authMode")}
          >
            <span>{t("wizard.authMode")}</span>
            {provider.capabilities.authModes.length > 1 ? (
              <div className="segmented">
                {provider.capabilities.authModes.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`segment ${authMode === mode ? "active" : ""}`}
                    aria-pressed={authMode === mode}
                    onClick={() => onChange({authMode: mode})}
                  >
                    {t(`auth.${mode}`)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="badge">{t(`auth.${authMode}`)}</span>
            )}
          </div>

          {provider.backends.length > 1 ? (
            <div className="field">
              <span>
                <label htmlFor={`${formId}-backend`}>{t("wizard.backend")}</label>
              </span>
              <Select
                id={`${formId}-backend`}
                className="input"
                value={backend}
                onChange={(event) => onChange({backend: event.target.value})}
              >
                {provider.backends.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="field">
            <span>
              <label htmlFor={`${formId}-schedule`}>
                {t("wizard.schedule")}
              </label>
            </span>
            <Select
              id={`${formId}-schedule`}
              className="input"
              value={schedule}
              onChange={(event) =>
                onChange({schedule: event.target.value as ScheduleChoice})
              }
            >
              <option value="manual">{t("schedule.manual")}</option>
              <option value="@hourly">{t("schedule.hourly")}</option>
              <option value="@daily">{t("schedule.daily")}</option>
              <option value="custom">{t("schedule.custom")}</option>
            </Select>
          </div>

          {schedule === "custom" ? (
            <div className="field">
              <span>
                <label htmlFor={`${formId}-custom-schedule`}>
                  {t("schedule.custom")}
                </label>
                <em className="required">{t("common.required")}</em>
              </span>
              <Input
                id={`${formId}-custom-schedule`}
                className="input"
                value={customSchedule}
                placeholder={t("schedule.customPlaceholder")}
                required
                aria-required="true"
                aria-invalid={
                  validation?.customScheduleInvalid ? true : undefined
                }
                aria-describedby={
                  validation?.customScheduleInvalid
                    ? `${formId}-custom-schedule-error`
                    : undefined
                }
                onChange={(event) =>
                  onChange({customSchedule: event.target.value})
                }
              />
              {validation?.customScheduleInvalid ? (
                <InlineError id={`${formId}-custom-schedule-error`}>
                  {t("detail.scheduleErrorCustom")}
                </InlineError>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <span>
              <label htmlFor={`${formId}-publish`}>
                {t("wizard.publish")}
              </label>
            </span>
            <Select
              id={`${formId}-publish`}
              className="input"
              value={publish}
              onChange={(event) =>
                onChange({publish: event.target.value as ProviderPublishPolicy})
              }
            >
              <option value="local-only">
                {t("publish.local-only")}
              </option>
              <option value="shared">{t("publish.shared")}</option>
            </Select>
          </div>
        </FormRow>

        {provider.configFields.some((field) => !field.secret) ? (
          <div className="form-section">
            <h4>{t("wizard.settings")}</h4>
            <div className="form-grid">
              {provider.configFields
                .filter((field) => !field.secret)
                .map((field) => {
                  const helpId = field.help
                    ? `${formId}-field-${field.key}-help`
                    : undefined;
                  const invalid =
                    submitCount > 0 &&
                    (validation?.missingSettings.includes(field.key) ??
                      false);
                  return (
                    <div className="field" key={field.key}>
                      <span>
                        <label
                          htmlFor={`${formId}-field-${field.key}`}
                        >
                          {field.label}
                        </label>
                        {field.required ? (
                          <em className="required">
                            {t("common.required")}
                          </em>
                        ) : (
                          <small>{t("common.optional")}</small>
                        )}
                      </span>
                      <Input
                        id={`${formId}-field-${field.key}`}
                        className="input"
                        value={settings[field.key] ?? ""}
                        placeholder={field.help}
                        required={field.required}
                        aria-required={field.required || undefined}
                        aria-invalid={invalid || undefined}
                        aria-describedby={
                          [
                            helpId,
                            invalid ? `${formId}-field-${field.key}-error` : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        onChange={(event) =>
                          onChange({settings: {...settings, [field.key]: event.target.value}})
                        }
                      />
                      {invalid ? <InlineError id={`${formId}-field-${field.key}-error`}>{t("wizard.errorFields")}</InlineError> : null}
                      {field.help ? (
                        <small id={helpId}>{field.help}</small>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}

        {oauth ? (
          <Notice variant="info">
            <span>{t("wizard.oauthNote")}</span>
          </Notice>
        ) : provider.configFields.some((field) => field.secret) ? (
          <div className="form-section">
            <h4>{t("wizard.secrets")}</h4>
            <p className="muted small">{t("wizard.secretNote")}</p>
            <div className="form-grid">
              {provider.configFields
                .filter((field) => field.secret)
                .map((field) => {
                  const helpId = field.help
                    ? `${formId}-secret-${field.key}-help`
                    : undefined;
                  const invalid =
                    submitCount > 0 &&
                    (validation?.missingSecrets.includes(field.key) ??
                      false);
                  return (
                    <div className="field" key={field.key}>
                      <span>
                        <label htmlFor={`${formId}-secret-${field.key}`}>
                          {field.label}
                        </label>
                        {field.required ? (
                          <em className="required">
                            {t("common.required")}
                          </em>
                        ) : (
                          <small>{t("common.optional")}</small>
                        )}
                      </span>
                      <Input
                        id={`${formId}-secret-${field.key}`}
                        className="input"
                        type="password"
                        autoComplete="off"
                        value={secrets[field.key] ?? ""}
                        placeholder={t("wizard.secretPlaceholder")}
                        required={field.required}
                        aria-required={field.required || undefined}
                        aria-invalid={invalid || undefined}
                        aria-describedby={
                          [
                            helpId,
                            invalid ? `${formId}-secret-${field.key}-error` : undefined,
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        onChange={(event) =>
                          onChange({secrets: {...secrets, [field.key]: event.target.value}})
                        }
                      />
                      {invalid ? <InlineError id={`${formId}-secret-${field.key}-error`}>{t("wizard.errorFields")}</InlineError> : null}
                      {field.help ? (
                        <small id={helpId}>{field.help}</small>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}

        {projects.length > 0 ? (
          <div className="form-section">
            <h4>
              {t("wizard.projects")} <small>{t("common.optional")}</small>
            </h4>
            <div
              className="checkbox-grid"
              role="group"
              aria-label={t("wizard.projects")}
            >
              {projects.map((project) => (
                <label className="checkbox" key={project.id}>
                  <Input
                    type="checkbox"
                    checked={selectedProjects.includes(project.id)}
                    onChange={(event) =>
                      onChange({selectedProjects: event.target.checked
                        ? [...selectedProjects, project.id]
                        : selectedProjects.filter((item) => item !== project.id)})
                    }
                  />
                  <span>{project.name || project.id}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted small">{t("wizard.noProjects")}</p>
        )}

        <div className="form-actions">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !engineReady || updating}
            aria-busy={busy}
          >
            {busy ? t("wizard.creating") : t("wizard.create")}
          </Button>
        </div>
      </form>
    </Card>
  </>
  );
}
