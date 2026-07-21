import { PageHeaderSkeleton, PageSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="portal settings">
      <PageHeaderSkeleton action={false} />
      <Skeleton className="mb-6 h-40 rounded-3xl" />
      <TableSkeleton rows={5} columns={5} />
    </PageSkeleton>
  );
}
