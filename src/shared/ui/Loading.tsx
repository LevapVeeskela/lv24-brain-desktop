export function Loading({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-busy="true">
    <span>{label}</span><div className="skeleton" aria-hidden="true" /><div className="skeleton skeleton-short" aria-hidden="true" />
  </div>;
}
