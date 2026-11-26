import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  IDEA_PRIORITIES,
  IDEA_TAGS_MAX,
  IDEA_TITLE_MAX,
  ideaStatusOptions,
  type Idea,
  type IdeaUpdateInput,
} from "@/entities/ideas/model/types";
import { useI18n } from "@/shared/i18n";
import {
  FOCUSABLE_SELECTOR,
  restoreFocusIfConnected,
  wrappedFocusableIndex,
} from "@/shared/lib/focus";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { Field, FormRow } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import {
  applyDraftPatch,
  draftFieldPatch,
  draftIsDirty,
  draftPatch,
  statusChange,
  toIdeaDraft,
  type IdeaDraft,
} from "../model/draft";
import { ideaSourceText } from "../model/format";
import { IDEA_PRIORITY_LABEL_KEYS, IDEA_STATUS_LABEL_KEYS } from "./labels";

export interface IdeaProjectOption {
  id: string;
  name: string;
}

export interface IdeaDrawerProps {
  idea: Idea;
  projects: readonly IdeaProjectOption[];
  saving: boolean;
  error: string | null;
  onSave: (patch: IdeaUpdateInput) => Promise<boolean> | void;
  onTrash: () => void;
  onClose: () => void;
}

/**
 * Side drawer for one idea. Fields save on blur/Enter (selects on change) with a
 * dirty guard; Delete moves the idea to trash and the page offers undo.
 */
export function IdeaDrawer({
  idea,
  projects,
  saving,
  error,
  onSave,
  onTrash,
  onClose,
}: IdeaDrawerProps) {
  const { t, locale } = useI18n();
  const headingId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const savesInFlight = useRef(0);
  const [draft, setDraft] = useState<IdeaDraft>(() => toIdeaDraft(idea));
  const [pendingDraft, setPendingDraft] = useState<IdeaDraft | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const dirty = draftIsDirty(draft, idea, pendingDraft);
  const source = ideaSourceText(idea);

  useEffect(() => {
    // Keep the pending baseline while a second save is still in flight.
    if (savesInFlight.current === 0) {
      setPendingDraft(null);
    }
  }, [idea]);

  // The drawer is modal; open on the title and hand focus back to the row.
  useEffect(() => {
    const target =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    titleRef.current?.focus();
    return () => restoreFocusIfConnected(target);
  }, []);

  const update = (patch: Partial<IdeaDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const send = (patch: IdeaUpdateInput): void => {
    savesInFlight.current += 1;
    setPendingDraft((current) =>
      applyDraftPatch(current ?? toIdeaDraft(idea), patch),
    );
    void Promise.resolve(onSave(patch)).then((ok) => {
      savesInFlight.current = Math.max(0, savesInFlight.current - 1);
      if (!ok) {
        setPendingDraft(null);
      }
    });
  };

  const commit = (field: keyof IdeaDraft): void => {
    const patch = draftFieldPatch(draft, idea, field);
    if (!patch) {
      if (field === "title" && !draft.title.trim()) {
        setDraft((current) => ({ ...current, title: idea.title }));
      }
      if (field === "projectId" && !draft.projectId.trim()) {
        setDraft((current) => ({ ...current, projectId: idea.projectId }));
      }
      return;
    }
    setDraft((current) => applyDraftPatch(current, patch));
    send(patch);
  };

  const commitAll = (): void => {
    const patch = draftPatch(draft, idea);
    if (!patch) {
      setDraft(toIdeaDraft(idea));
      return;
    }
    setDraft((current) => {
      const next = applyDraftPatch(current, patch);
      if (!next.title.trim()) {
        next.title = idea.title;
      }
      if (!next.projectId.trim()) {
        next.projectId = idea.projectId;
      }
      return next;
    });
    send(patch);
  };

  const requestClose = (): void => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const onEnter = (field: keyof IdeaDraft) =>
    (event: ReactKeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit(field);
      }
    };

  const onDrawerKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      // The page also listens for Escape; one press must close one layer.
      event.stopPropagation();
      if (discardOpen) {
        setDiscardOpen(false);
        return;
      }
      if (dirty) {
        setDiscardOpen(true);
        return;
      }
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const container = drawerRef.current;
    if (!container) {
      return;
    }
    const focusable = [
      ...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ];
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = wrappedFocusableIndex(
      focusable.length,
      current,
      event.shiftKey,
    );
    if (next !== null) {
      event.preventDefault();
      focusable[next]?.focus();
    }
  };

  return (
    <>
      <div
        className="idea-drawer-backdrop"
        aria-hidden="true"
        onClick={requestClose}
      />
      <aside
        ref={drawerRef}
        className="idea-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={onDrawerKeyDown}
      >
        <div className="idea-drawer-header">
          <div>
            <p className="eyebrow">{t("nav.ideas")}</p>
            <h2 id={headingId}>{t("ideas.drawerTitle")}</h2>
          </div>
          <Button aria-label={t("common.close")} onClick={requestClose}>
            {t("common.close")}
          </Button>
        </div>

        {error ? <Notice variant="error">{error}</Notice> : null}

        <div className="idea-drawer-body">
          <Field id="idea-title" label={t("ideas.titleLabel")}>
            <input
              id="idea-title"
              ref={titleRef}
              className="input"
              maxLength={IDEA_TITLE_MAX}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
              onBlur={() => commit("title")}
              onKeyDown={onEnter("title")}
            />
          </Field>

          <FormRow>
            <Field id="idea-status" label={t("ideas.statusLabel")}>
              <Select
                id="idea-status"
                value={draft.status}
                onChange={(event) => {
                  const change = statusChange(
                    draft,
                    idea,
                    event.target.value as IdeaDraft["status"],
                  );
                  setDraft(change.draft);
                  if (change.patch) {
                    send(change.patch);
                  }
                }}
              >
                {ideaStatusOptions(draft.status).map((status) => (
                  <option key={status} value={status}>
                    {t(IDEA_STATUS_LABEL_KEYS[status])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="idea-priority" label={t("ideas.priorityLabel")}>
              <Select
                id="idea-priority"
                value={draft.priority}
                onChange={(event) => {
                  const priority = event.target.value as IdeaDraft["priority"];
                  update({ priority });
                  const patch = draftFieldPatch(
                    { ...draft, priority },
                    idea,
                    "priority",
                  );
                  if (patch) {
                    send(patch);
                  }
                }}
              >
                {IDEA_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(IDEA_PRIORITY_LABEL_KEYS[priority])}
                  </option>
                ))}
              </Select>
            </Field>
          </FormRow>

          <Field id="idea-project" label={t("common.project")} hint={t("ideas.projectHint")}>
            <Input
              id="idea-project"
              list="idea-project-options"
              aria-describedby="idea-project-hint"
              value={draft.projectId}
              onChange={(event) => update({ projectId: event.target.value })}
              onBlur={() => commit("projectId")}
              onKeyDown={onEnter("projectId")}
            />
            <datalist id="idea-project-options">
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name || project.id}
                </option>
              ))}
            </datalist>
          </Field>

          <FormRow>
            <Field id="idea-due-date" label={t("ideas.dueDate")}>
              <Input
                id="idea-due-date"
                type="date"
                value={draft.dueDate}
                onChange={(event) => update({ dueDate: event.target.value })}
                onBlur={() => commit("dueDate")}
                onKeyDown={onEnter("dueDate")}
              />
            </Field>
            <Field id="idea-due-time" label={t("ideas.dueTime")}>
              <Input
                id="idea-due-time"
                type="time"
                value={draft.dueTime}
                onChange={(event) => update({ dueTime: event.target.value })}
                onBlur={() => commit("dueTime")}
                onKeyDown={onEnter("dueTime")}
              />
            </Field>
          </FormRow>

          <Field
            id="idea-reminder"
            label={t("ideas.reminderLabel")}
            hint={t("ideas.reminderHint")}
          >
            <Input
              id="idea-reminder"
              type="number"
              min={0}
              step={10}
              placeholder="0"
              aria-describedby="idea-reminder-hint"
              value={draft.reminder}
              onChange={(event) => update({ reminder: event.target.value })}
              onBlur={() => commit("reminder")}
              onKeyDown={onEnter("reminder")}
            />
          </Field>

          <Field
            id="idea-tags"
            label={t("ideas.tagsLabel")}
            hint={t("ideas.tagsHint", { count: IDEA_TAGS_MAX })}
          >
            <Input
              id="idea-tags"
              aria-describedby="idea-tags-hint"
              value={draft.tags}
              onChange={(event) => update({ tags: event.target.value })}
              onBlur={() => commit("tags")}
              onKeyDown={onEnter("tags")}
            />
          </Field>

          <Field id="idea-body" label={t("ideas.bodyLabel")}>
            <textarea
              id="idea-body"
              className="input idea-body-input"
              rows={6}
              value={draft.body}
              onChange={(event) => update({ body: event.target.value })}
              onBlur={() => commit("body")}
            />
          </Field>

          {draft.status === "done" || draft.status === "dropped" ? (
            <Field
              id="idea-completion-note"
              label={t("ideas.completionNote")}
              hint={t("ideas.completionNoteHint")}
            >
              <textarea
                id="idea-completion-note"
                className="input idea-body-input"
                aria-describedby="idea-completion-note-hint"
                rows={2}
                value={draft.completionNote}
                onChange={(event) =>
                  update({ completionNote: event.target.value })
                }
                onBlur={() => commit("completionNote")}
              />
            </Field>
          ) : null}

          <dl className="details idea-meta">
            <dt>{t("ideas.sourceLabel")}</dt>
            <dd>{source ?? t("common.none")}</dd>
            <dt>{t("ideas.createdLabel")}</dt>
            <dd>{formatDateTime(idea.createdAt, locale)}</dd>
            <dt>{t("ideas.updatedLabel")}</dt>
            <dd>{formatDateTime(idea.updatedAt, locale)}</dd>
          </dl>

          <div className="idea-drawer-savebar">
            <span className="muted small" role="status">
              {dirty ? t("ideas.dirty") : t("ideas.clean")}
            </span>
            <Button
              variant="primary"
              loading={saving}
              disabled={!dirty}
              onClick={commitAll}
            >
              {saving ? t("ideas.saving") : t("common.save")}
            </Button>
          </div>
        </div>

        <div className="idea-drawer-actions">
          <Button variant="danger" disabled={saving} onClick={onTrash}>
            {t("common.delete")}
          </Button>
          <span className="muted small">{t("ideas.deleteHint")}</span>
        </div>
      </aside>

      <ConfirmDialog
        open={discardOpen}
        title={t("ideas.discardTitle")}
        confirmLabel={t("ideas.discard")}
        cancelLabel={t("common.cancel")}
        danger
        busy={saving}
        onConfirm={() => {
          setDraft(toIdeaDraft(idea));
          setDiscardOpen(false);
          onClose();
        }}
        onCancel={() => setDiscardOpen(false)}
      >
        <p>{t("ideas.discardBody")}</p>
      </ConfirmDialog>
    </>
  );
}
