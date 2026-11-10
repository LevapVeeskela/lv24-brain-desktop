import type { PropsWithChildren } from "react";

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}>) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
