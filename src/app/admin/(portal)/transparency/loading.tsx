import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  Skeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the transparency board">
      <PageHeaderSkeleton />
      {/* Legislative / Documents / Projects tabs. */}
      <Skeleton className="mb-6 h-12 w-96 max-w-full rounded-full" />
      <FilterBarSkeleton selects={1} />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
