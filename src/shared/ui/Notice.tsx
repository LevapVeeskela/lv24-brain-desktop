import type { PropsWithChildren, ReactNode } from "react";

export function Notice({
  variant,
  children,
  action,
}: PropsWithChildren<{ variant: "info" | "error"; action?: ReactNode }>) {
  return (
    <div className={`notice ${variant}`} role={variant === "error" ? "alert" : "status"}>
      {children}
      {action}
    </div>
  );
}
