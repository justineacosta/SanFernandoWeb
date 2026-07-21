import { PageHeaderSkeleton, PageSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="events">
      <PageHeaderSkeleton />
      {/* Event list beside the mini calendar. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <TableSkeleton rows={6} columns={4} />
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    </PageSkeleton>
  );
}
