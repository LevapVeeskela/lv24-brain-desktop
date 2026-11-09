import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "link";

export function Button({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const classes = ["btn", `btn-${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...props} />;
}
