import type { IdeaPriority, IdeaStatus } from "@/entities/ideas/model/types";
import type { MessageKey, MessageParams } from "@/shared/i18n";
import type { DueChip, LeadParts } from "../model/format";

export const IDEA_STATUS_LABEL_KEYS: Record<IdeaStatus, MessageKey> = {
  open: "ideas.status.open",
  doing: "ideas.status.doing",
  done: "ideas.status.done",
  dropped: "ideas.status.dropped",
  someday: "ideas.status.someday",
};

export const IDEA_PRIORITY_LABEL_KEYS: Record<IdeaPriority, MessageKey> = {
  low: "ideas.priority.low",
  normal: "ideas.priority.normal",
  high: "ideas.priority.high",
};

type Translate = (key: MessageKey, params?: MessageParams) => string;

export function dueChipText(chip: DueChip, t: Translate): string {
  switch (chip.kind) {
    case "overdue":
      return `! ${t("ideas.daysOverdue", { count: chip.days })}`;
    case "time":
      return chip.time;
    case "allDay":
      return t("ideas.dueAllDay");
    case "weekday":
    case "date":
      return chip.label;
  }
}

export function leadText(parts: LeadParts, t: Translate): string {
  switch (parts.unit) {
    case "minute":
      return t("ideas.lead.minute", { count: parts.count });
    case "hour":
      return t("ideas.lead.hour", { count: parts.count });
    case "day":
      return t("ideas.lead.day", { count: parts.count });
  }
}
