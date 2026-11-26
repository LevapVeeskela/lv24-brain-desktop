import type { Idea } from "@/entities/ideas/model/types";
import {
  isClosedIdeaStatus,
  isOpenIdeaStatus,
} from "@/entities/ideas/model/types";
import { dayDifference, endOfLocalWeek, ideaDueDay, isTimedIdea } from "./format";

export type IdeaGroupKey = "overdue" | "today" | "week" | "later" | "done";

export interface IdeaGroup {
  key: IdeaGroupKey;
  ideas: Idea[];
}

export interface IdeaScopeOptions {
  scope: "all" | "project";
  projectId: string | null;
  query: string;
}

const priorityRank: Record<Idea["priority"], number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/** Case-insensitive title/tag/project match; the body stays out of quick search. */
export function matchesIdeaQuery(idea: Idea, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return (
    idea.title.toLowerCase().includes(needle) ||
    idea.projectId.toLowerCase().includes(needle) ||
    idea.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

export function filterIdeas(
  ideas: readonly Idea[],
  options: IdeaScopeOptions,
): Idea[] {
  return ideas.filter((idea) => {
    if (options.scope === "project" && idea.projectId !== options.projectId) {
      return false;
    }
    return matchesIdeaQuery(idea, options.query);
  });
}

/** Stable open-first order for the flat All tab and the groups. */
export function sortIdeas(ideas: readonly Idea[]): Idea[] {
  return ideas.slice().sort((left, right) => {
    const leftClosed = isClosedIdeaStatus(left.status);
    const rightClosed = isClosedIdeaStatus(right.status);
    if (leftClosed !== rightClosed) {
      return leftClosed ? 1 : -1;
    }
    if (leftClosed) {
      return (
        (right.completedAt ?? right.updatedAt).localeCompare(
          left.completedAt ?? left.updatedAt,
        ) || left.title.localeCompare(right.title)
      );
    }
    const leftDue = ideaDueDay(left);
    const rightDue = ideaDueDay(right);
    if (leftDue && !rightDue) {
      return -1;
    }
    if (!leftDue && rightDue) {
      return 1;
    }
    if (leftDue && rightDue) {
      const byDay = dayDifference(leftDue, rightDue);
      if (byDay !== 0) {
        return byDay;
      }
      const leftTime = isTimedIdea(left) ? left.dueAt ?? "" : "";
      const rightTime = isTimedIdea(right) ? right.dueAt ?? "" : "";
      if (leftTime !== rightTime) {
        return leftTime.localeCompare(rightTime);
      }
    }
    const byPriority = priorityRank[left.priority] - priorityRank[right.priority];
    if (byPriority !== 0) {
      return byPriority;
    }
    return left.title.localeCompare(right.title);
  });
}

/**
 * Focus groups, in the spec order. `done`/`dropped` always land in the done
 * group; `someday` stays in Later even when it carries a date.
 */
export function groupIdeas(ideas: readonly Idea[], now: Date): IdeaGroup[] {
  const buckets: Record<IdeaGroupKey, Idea[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    done: [],
  };
  const weekEnd = endOfLocalWeek(now);

  for (const idea of ideas) {
    if (isClosedIdeaStatus(idea.status)) {
      buckets.done.push(idea);
      continue;
    }
    const dueDay = ideaDueDay(idea);
    if (idea.status !== "someday" && dueDay) {
      const diff = dayDifference(dueDay, now);
      if (diff < 0) {
        buckets.overdue.push(idea);
        continue;
      }
      if (diff === 0) {
        buckets.today.push(idea);
        continue;
      }
      if (dayDifference(dueDay, weekEnd) <= 0) {
        buckets.week.push(idea);
        continue;
      }
    }
    buckets.later.push(idea);
  }

  return (Object.keys(buckets) as IdeaGroupKey[])
    .map((key) => ({ key, ideas: sortIdeas(buckets[key]) }))
    .filter((group) => group.ideas.length > 0);
}

/** Global, scope-independent count for the rail badge and the header. */
export function openIdeaCount(ideas: readonly Idea[]): number {
  return ideas.filter((idea) => isOpenIdeaStatus(idea.status)).length;
}

export function dueTodayCount(ideas: readonly Idea[], now: Date): number {
  return ideas.filter((idea) => {
    if (!isOpenIdeaStatus(idea.status)) {
      return false;
    }
    const dueDay = ideaDueDay(idea);
    return dueDay ? dayDifference(dueDay, now) === 0 : false;
  }).length;
}

/**
 * Focus drawer opener for `?focus=`: only a loaded, known idea that was not
 * already dismissed returns a target. `dismissedFocusId` stops the same param
 * from reopening the drawer after close, before the router clears it.
 */
export function focusDrawerTarget(input: {
  focusId: string | null;
  loaded: boolean;
  ideas: readonly Idea[];
  drawerId: string | null;
  dismissedFocusId?: string | null;
}): string | null {
  if (
    !input.focusId ||
    !input.loaded ||
    input.drawerId !== null ||
    input.dismissedFocusId === input.focusId
  ) {
    return null;
  }
  return input.ideas.some((idea) => idea.id === input.focusId)
    ? input.focusId
    : null;
}

/** A stale `?focus=` should leave the URL instead of silently doing nothing. */
export function shouldClearFocusParam(input: {
  focusId: string | null;
  loaded: boolean;
  ideas: readonly Idea[];
}): boolean {
  if (!input.focusId || !input.loaded) {
    return false;
  }
  return !input.ideas.some((idea) => idea.id === input.focusId);
}

/** Tray "New idea" opens `#/ideas?new=1`; the page focuses quick add once. */
export function isNewIdeaRequest(param: string | null): boolean {
  return param === "1" || param === "true";
}

/** Dashboard preview: overdue first, then today, at most three rows. */
export function todayPreview(
  ideas: readonly Idea[],
  now: Date,
  limit = 3,
): Idea[] {
  const candidates = ideas.filter((idea) => {
    if (!isOpenIdeaStatus(idea.status)) {
      return false;
    }
    const dueDay = ideaDueDay(idea);
    return dueDay ? dayDifference(dueDay, now) <= 0 : false;
  });
  return sortIdeas(candidates).slice(0, limit);
}
