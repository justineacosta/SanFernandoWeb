import {
  PageHeaderSkeleton,
  PageSkeleton,
  Skeleton,
  CardGridSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the site content editor">
      <PageHeaderSkeleton />
      {/* The Home | About switch, then the block cards beneath it. */}
      <Skeleton className="h-11 w-56 rounded-2xl" />
      <CardGridSkeleton count={4} />
    </PageSkeleton>
  );
}
