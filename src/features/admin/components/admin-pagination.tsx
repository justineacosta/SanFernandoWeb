import { Pagination } from "@/components/ui/pagination";

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * The admin managers' pagination footer.
 *
 * Kept as a named wrapper so eleven managers keep one unchanged import, while
 * the markup and the page windowing live in the shared primitive — the public
 * transparency archives render the same control in link mode.
 */
export function AdminPagination(props: AdminPaginationProps) {
  return <Pagination {...props} label="records" />;
}
