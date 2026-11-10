import { useId, useRef, useState, type ReactNode } from "react";

export interface TabItem { id: string; label: string; content: ReactNode }

/** Automatic activation; native buttons with the standard arrow/Home/End keys. */
export function Tabs({ label, items }: { label: string; items: readonly TabItem[] }) {
  const [selected, setSelected] = useState(items[0]?.id);
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  const active = items.some((item) => item.id === selected) ? selected : items[0]?.id;
  return <div className="tabs">
    <div className="tabs-list" role="tablist" aria-label={label} ref={list}>
      {items.map((item, index) => <button key={item.id} type="button" role="tab"
        id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}
        aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1}
        onClick={() => setSelected(item.id)}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % items.length
            : event.key === "ArrowLeft" ? (index + items.length - 1) % items.length
              : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setSelected(items[next].id);
          list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{item.label}</button>)}
    </div>
    {items.map((item) => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
      aria-labelledby={`${id}-tab-${item.id}`} hidden={active !== item.id} tabIndex={0}>
      {item.content}
    </div>)}
  </div>;
}
