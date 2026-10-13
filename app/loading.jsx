import { Skeleton, SkeletonText } from "@/components/Skeleton.jsx";

export default function Loading() {
  return (
    <div className="page" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-6 h-5 w-32" />
      <SkeletonText lines={4} className="mt-3" />
    </div>
  );
}
