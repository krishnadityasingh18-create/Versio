// @ts-nocheck
// Skeleton placeholders: reserve layout while content loads so it doesn't jump in (CLS).
// Visual blocks are decorative (aria-hidden); <Loading> gives screen readers the busy status.

/** One skeleton block. Size it with className (h-*, w-*). */
export function Skeleton({ className = "" }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** `lines` text-height bars; the last is shorter, like a real paragraph. */
export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div aria-hidden="true" className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Accessible busy wrapper: announces `label` to assistive tech, renders the skeleton visually. */
export function Loading({ label = "Loading…", className = "", children }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
