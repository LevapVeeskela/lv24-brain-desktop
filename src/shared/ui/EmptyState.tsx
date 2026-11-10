import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong>{hint && <p>{hint}</p>}{action && <div>{action}</div>}</div>;
}
