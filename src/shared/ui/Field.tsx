import type { PropsWithChildren, ReactNode } from "react";
import { InlineError } from "./InlineError";

/** Pass `${id}-hint` / `${id}-error` to the control's aria-describedby. */
export function Field({ id, label, hint, error, required, children }: PropsWithChildren<{
  id: string; label: string; hint?: ReactNode; error?: string; required?: boolean;
}>) {
  return <div className="field">
    <label htmlFor={id}>{label}{required && <span className="required" aria-hidden="true">*</span>}</label>
    {children}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
    {error && <InlineError id={`${id}-error`}>{error}</InlineError>}
  </div>;
}

export function FormRow({ children }: PropsWithChildren) {
  return <div className="form-grid">{children}</div>;
}
