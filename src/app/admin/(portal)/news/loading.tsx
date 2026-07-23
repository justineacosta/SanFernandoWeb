import {
  CardGridSkeleton,
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="news and announcements">
      <PageHeaderSkeleton />
      {/* The News / Announcements tab pill. */}
      <Skeleton className="mb-6 h-12 w-72 rounded-full" />
      <FilterBarSkeleton />
      <CardGridSkeleton />
    </PageSkeleton>
  );
}
