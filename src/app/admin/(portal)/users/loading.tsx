import { PageHeaderSkeleton, PageSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the user list">
      <PageHeaderSkeleton />
      <TableSkeleton rows={6} columns={6} />
    </PageSkeleton>
  );
}
