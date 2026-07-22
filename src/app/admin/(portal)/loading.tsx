import {
  PageHeaderSkeleton,
  PageSkeleton,
  Skeleton,
  StatCardsSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the portal">
      <PageHeaderSkeleton action={false} />
      <StatCardsSkeleton count={4} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-3xl" />
        <Skeleton className="h-72 rounded-3xl" />
      </div>
    </PageSkeleton>
  );
}
