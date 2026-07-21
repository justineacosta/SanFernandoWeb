import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the audit log">
      <PageHeaderSkeleton action={false} />
      <FilterBarSkeleton selects={3} />
      <TableSkeleton rows={10} columns={4} />
    </PageSkeleton>
  );
}
