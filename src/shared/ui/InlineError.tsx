import type { PropsWithChildren } from "react";

export function InlineError({
  id,
  children,
}: PropsWithChildren<{ id?: string }>) {
  return (
    <p id={id} className="inline-error" role="alert">
      {children}
    </p>
  );
}
