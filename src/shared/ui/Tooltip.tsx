import { cloneElement, useId, useState, type ReactElement } from "react";

/** Use with one focusable child. Essential information must remain inline. */
export function Tooltip({ label, children }: {
  label: string; children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <span className="tooltip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocusCapture={() => setOpen(true)} onBlurCapture={() => setOpen(false)}
    onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
    {cloneElement(children, { "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" ") })}
    <span id={id} role="tooltip" className={`tooltip-content ${open ? "is-visible" : ""}`}>{label}</span>
  </span>;
}
