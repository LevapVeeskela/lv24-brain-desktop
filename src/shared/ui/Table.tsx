import type { PropsWithChildren } from "react";

export function Table({ caption, children, className = "" }: PropsWithChildren<{ caption: string; className?: string }>) {
  return <div className="table-wrap"><table className={`data-table ${className}`.trim()}>
    <caption className="sr-only">{caption}</caption>{children}
  </table></div>;
}
