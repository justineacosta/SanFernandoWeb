import {
  PageHeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the officials directory">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
