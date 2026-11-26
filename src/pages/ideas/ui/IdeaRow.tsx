import { useI18n } from "@/shared/i18n";
import {
  isClosedIdeaStatus,
  type Idea,
} from "@/entities/ideas/model/types";
import {
  dueChip,
  formatIdeaDue,
  formatLeadParts,
} from "../model/format";
import { dueChipText, IDEA_STATUS_LABEL_KEYS, leadText } from "./labels";

export interface IdeaRowProps {
  idea: Idea;
  now: Date;
  locale: string;
  cursor?: boolean;
  busy?: boolean;
  onOpen: () => void;
  onToggle: () => void;
}

/** One dense line: checkbox, title, project/due/reminder/status chips. */
export function IdeaRow({
  idea,
  now,
  locale,
  cursor = false,
  busy = false,
  onOpen,
  onToggle,
}: IdeaRowProps) {
  const { t } = useI18n();
  const closed = isClosedIdeaStatus(idea.status);
  // Reminders are cancelled once an idea is closed; no amber overdue chip.
  const chip = closed ? null : dueChip(idea, now, locale);
  const lead =
    !closed && idea.remindBeforeMinutes
      ? formatLeadParts(idea.remindBeforeMinutes)
      : null;
  const fullDue = formatIdeaDue(idea, locale);
  const classes = ["idea-row"];
  if (closed) classes.push("is-done");
  if (cursor) classes.push("is-cursor");

  return (
    <li className={classes.join(" ")} data-idea-id={idea.id}>
      <input
        type="checkbox"
        className="idea-check"
        checked={closed}
        disabled={busy}
        aria-label={t(closed ? "ideas.reopen" : "ideas.complete", {
          title: idea.title,
        })}
        onChange={onToggle}
      />
      <div className="idea-main">
        <button
          type="button"
          className="idea-title"
          title={fullDue ?? idea.title}
          onClick={closed ? onToggle : onOpen}
        >
          {closed ? <s>{idea.title}</s> : idea.title}
        </button>
      </div>
      <div className="idea-chips">
        <span className="idea-chip idea-project">{idea.projectId}</span>
        {chip ? (
          <span
            className={`idea-chip idea-due${chip.kind === "overdue" ? " is-overdue" : ""}`}
            title={fullDue ?? undefined}
          >
            {dueChipText(chip, t)}
          </span>
        ) : null}
        {lead ? (
          <span className="idea-chip idea-reminder">
            {t("ideas.reminderChip", { value: leadText(lead, t) })}
          </span>
        ) : null}
        {idea.status !== "open" ? (
          <span className={`idea-chip idea-status is-${idea.status}`}>
            {t(IDEA_STATUS_LABEL_KEYS[idea.status])}
          </span>
        ) : null}
      </div>
    </li>
  );
}
