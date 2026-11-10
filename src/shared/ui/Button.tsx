import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "link" | "danger";

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  loading = false,
  disabled,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const classes = ["btn", `btn-${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...props} type={type} className={classes}
      disabled={disabled || loading} aria-busy={loading || props["aria-busy"] || undefined}>
      {loading ? <span className="button-progress" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
