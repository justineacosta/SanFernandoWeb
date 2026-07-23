import { PageHeaderSkeleton, PageSkeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the services catalog">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
