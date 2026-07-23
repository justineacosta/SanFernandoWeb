import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="incident reports">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </PageSkeleton>
  );
}
