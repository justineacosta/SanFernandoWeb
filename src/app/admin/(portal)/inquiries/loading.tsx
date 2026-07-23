import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the inbox">
      <PageHeaderSkeleton />
      {/* Stands in for the tab strip, so nothing below it jumps when it arrives. */}
      <div className="mb-6 h-11 w-64 rounded-full bg-ink-100" />
      <StatCardsSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
