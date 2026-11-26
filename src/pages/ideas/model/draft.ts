import {
  IDEA_TAGS_MAX,
  IDEA_TITLE_MAX,
  type Idea,
  type IdeaPriority,
  type IdeaStatus,
  type IdeaUpdateInput,
} from "@/entities/ideas/model/types";
import { dueInputs, localDateTimeToIso } from "./format";

/** Uncommitted drawer values; every field is a string input value. */
export interface IdeaDraft {
  title: string;
  status: IdeaStatus;
  projectId: string;
  priority: IdeaPriority;
  dueDate: string;
  dueTime: string;
  reminder: string;
  tags: string;
  body: string;
  completionNote: string;
}

export function toIdeaDraft(idea: Idea): IdeaDraft {
  const due = dueInputs(idea);
  return {
    title: idea.title,
    status: idea.status,
    projectId: idea.projectId,
    priority: idea.priority,
    dueDate: due.date,
    dueTime: due.time,
    reminder: idea.remindBeforeMinutes
      ? String(idea.remindBeforeMinutes)
      : "",
    tags: idea.tags.join(", "),
    body: idea.body,
    completionNote: idea.completionNote ?? "",
  };
}

/** Comma-separated tags, trimmed, de-duplicated and capped like the record. */
export function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
    if (tags.length === IDEA_TAGS_MAX) {
      break;
    }
  }
  return tags;
}

export function dirtyFields(draft: IdeaDraft, idea: Idea): string[] {
  const changed: string[] = [];
  if (draft.title !== idea.title) changed.push("title");
  if (draft.status !== idea.status) changed.push("status");
  if (draft.projectId !== idea.projectId) changed.push("projectId");
  if (draft.priority !== idea.priority) changed.push("priority");
  const due = dueInputs(idea);
  if (draft.dueDate !== due.date || draft.dueTime !== due.time) {
    changed.push("due");
  }
  if (draft.reminder !== (idea.remindBeforeMinutes ? String(idea.remindBeforeMinutes) : "")) {
    changed.push("reminder");
  }
  if (draft.tags !== idea.tags.join(", ")) changed.push("tags");
  if (draft.body !== idea.body) changed.push("body");
  if (draft.completionNote !== (idea.completionNote ?? "")) {
    changed.push("completionNote");
  }
  return changed;
}

export function isDraftDirty(draft: IdeaDraft, idea: Idea): boolean {
  return dirtyFields(draft, idea).length > 0;
}

export function draftsEqual(left: IdeaDraft, right: IdeaDraft): boolean {
  return (
    left.title === right.title &&
    left.status === right.status &&
    left.projectId === right.projectId &&
    left.priority === right.priority &&
    left.dueDate === right.dueDate &&
    left.dueTime === right.dueTime &&
    left.reminder === right.reminder &&
    left.tags === right.tags &&
    left.body === right.body &&
    left.completionNote === right.completionNote
  );
}

/**
 * Dirty guard that treats a save still in flight as already part of the
 * baseline, so closing the drawer during a blur PATCH does not warn.
 */
export function draftIsDirty(
  draft: IdeaDraft,
  idea: Idea,
  pendingDraft?: IdeaDraft | null,
): boolean {
  return pendingDraft
    ? !draftsEqual(draft, pendingDraft)
    : isDraftDirty(draft, idea);
}

/**
 * Patch for the changed fields only. Returns null when nothing meaningful
 * changed, so blur handlers can stay cheap. An empty title or project is never
 * written; the drawer keeps its previous value.
 */
export function draftPatch(draft: IdeaDraft, idea: Idea): IdeaUpdateInput | null {
  const changed = new Set(dirtyFields(draft, idea));
  const patch: IdeaUpdateInput = {};

  const title = draft.title.trim();
  if (changed.has("title") && title) {
    patch.title = title.slice(0, IDEA_TITLE_MAX);
  }
  if (changed.has("status")) {
    patch.status = draft.status;
  }
  const projectId = draft.projectId.trim();
  if (changed.has("projectId") && projectId) {
    patch.projectId = projectId;
  }
  if (changed.has("priority")) {
    patch.priority = draft.priority;
  }
  if (changed.has("due")) {
    if (!draft.dueDate) {
      patch.dueDate = null;
      patch.dueAt = null;
    } else if (draft.dueTime) {
      const iso = localDateTimeToIso(draft.dueDate, draft.dueTime);
      if (iso) {
        patch.dueAt = iso;
        patch.dueDate = null;
      } else {
        // An invalid time must not silently erase the day.
        patch.dueDate = draft.dueDate;
        patch.dueAt = null;
      }
    } else {
      patch.dueDate = draft.dueDate;
      patch.dueAt = null;
    }
  }
  if (changed.has("reminder")) {
    const minutes = Number.parseInt(draft.reminder, 10);
    patch.remindBeforeMinutes =
      Number.isFinite(minutes) && minutes > 0 ? Math.trunc(minutes) : null;
  }
  if (changed.has("tags")) {
    patch.tags = normalizeTags(draft.tags);
  }
  if (changed.has("body")) {
    patch.body = draft.body;
  }
  if (changed.has("completionNote")) {
    patch.completionNote = draft.completionNote.trim() || null;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** One field commit for the save-on-blur handlers. */
export function draftFieldPatch(
  draft: IdeaDraft,
  idea: Idea,
  field: keyof IdeaDraft,
): IdeaUpdateInput | null {
  const full = draftPatch(draft, idea);
  if (!full) {
    return null;
  }
  switch (field) {
    case "title":
      return full.title !== undefined ? { title: full.title } : null;
    case "status":
      return full.status !== undefined ? { status: full.status } : null;
    case "projectId":
      return full.projectId !== undefined
        ? { projectId: full.projectId }
        : null;
    case "priority":
      return full.priority !== undefined ? { priority: full.priority } : null;
    case "dueDate":
    case "dueTime":
      return full.dueAt !== undefined || full.dueDate !== undefined
        ? { dueAt: full.dueAt, dueDate: full.dueDate }
        : null;
    case "reminder":
      return full.remindBeforeMinutes !== undefined
        ? { remindBeforeMinutes: full.remindBeforeMinutes }
        : null;
    case "tags":
      return full.tags !== undefined ? { tags: full.tags } : null;
    case "body":
      return full.body !== undefined ? { body: full.body } : null;
    case "completionNote":
      return full.completionNote !== undefined
        ? { completionNote: full.completionNote }
        : null;
  }
}

/**
 * Applies a status-select change. Reopening a done/dropped idea clears the
 * completion note in the same patch and in the hidden draft value.
 */
export function statusChange(
  draft: IdeaDraft,
  idea: Idea,
  status: IdeaStatus,
): { draft: IdeaDraft; patch: IdeaUpdateInput | null } {
  // Reopening is judged from both sides: a status save may still be in flight,
  // so the draft can be closed while the record is still open.
  const draftClosed = draft.status === "done" || draft.status === "dropped";
  const ideaClosed = idea.status === "done" || idea.status === "dropped";
  const reopening = (draftClosed || ideaClosed) && status === "open";
  const nextDraft: IdeaDraft = {
    ...draft,
    status,
    ...(reopening ? { completionNote: "" } : {}),
  };
  const base = draftFieldPatch(nextDraft, idea, "status");
  if (!base) {
    return { draft: nextDraft, patch: null };
  }
  return {
    draft: nextDraft,
    patch: reopening ? { ...base, completionNote: null } : base,
  };
}

/**
 * Mirrors an accepted patch into the draft so trimming/normalization does not
 * leave the drawer looking dirty after a successful save.
 */
export function applyDraftPatch(
  draft: IdeaDraft,
  patch: IdeaUpdateInput,
): IdeaDraft {
  const next = { ...draft };
  if (patch.title !== undefined) {
    next.title = patch.title;
  }
  if (patch.projectId !== undefined) {
    next.projectId = patch.projectId;
  }
  if (patch.status !== undefined) {
    next.status = patch.status;
  }
  if (patch.priority !== undefined) {
    next.priority = patch.priority;
  }
  if (patch.tags !== undefined) {
    next.tags = patch.tags.join(", ");
  }
  if (patch.remindBeforeMinutes !== undefined) {
    next.reminder = patch.remindBeforeMinutes
      ? String(patch.remindBeforeMinutes)
      : "";
  }
  if (patch.dueAt !== undefined || patch.dueDate !== undefined) {
    const due = dueInputs({
      dueAt: patch.dueAt ?? undefined,
      dueDate: patch.dueDate ?? undefined,
    });
    next.dueDate = due.date;
    next.dueTime = due.time;
  }
  if (patch.body !== undefined) {
    next.body = patch.body;
  }
  if (patch.completionNote !== undefined) {
    next.completionNote = patch.completionNote ?? "";
  }
  return next;
}
