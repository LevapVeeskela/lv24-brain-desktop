import type { Proposal } from "@/entities/memory/model/types";

/**
 * Queue order from the UX audit: stale or orphaned sources first, then the
 * least confident candidates, then the oldest. Newest-first is deliberately
 * not used because newest candidates are usually the least urgent.
 */
export function sortProposals(proposals: readonly Proposal[]): Proposal[] {
  return [...proposals].sort((left, right) => {
    const leftUrgent = left.sourceStale || left.sourceOrphan ? 0 : 1;
    const rightUrgent = right.sourceStale || right.sourceOrphan ? 0 : 1;
    if (leftUrgent !== rightUrgent) {
      return leftUrgent - rightUrgent;
    }
    if (left.confidence !== right.confidence) {
      return left.confidence - right.confidence;
    }
    return timestamp(left.createdAt) - timestamp(right.createdAt);
  });
}

function timestamp(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function nextSelection(
  proposals: readonly Proposal[],
  currentId: string | null,
  direction: 1 | -1,
): string | null {
  if (proposals.length === 0) {
    return null;
  }
  const index = proposals.findIndex((proposal) => proposal.id === currentId);
  if (index === -1) {
    return proposals[0].id;
  }
  const next = Math.min(
    proposals.length - 1,
    Math.max(0, index + direction),
  );
  return proposals[next].id;
}

export function dedupeProposals(proposals: readonly Proposal[]): Proposal[] {
  const seen = new Set<string>();
  const result: Proposal[] = [];
  for (const proposal of proposals) {
    const key = `${proposal.projectId}:${proposal.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(proposal);
  }
  return result;
}

export function mergeProposals(...groups: readonly (readonly Proposal[])[]): Proposal[] {
  return sortProposals(dedupeProposals(groups.flat()));
}

export function filterProposals(
  proposals: readonly Proposal[],
  filter: "all" | "pending" | "snoozed",
): Proposal[] {
  return proposals.filter((proposal) => {
    if (filter === "pending") {
      return !proposal.snoozed;
    }
    if (filter === "snoozed") {
      return Boolean(proposal.snoozed);
    }
    return true;
  });
}
