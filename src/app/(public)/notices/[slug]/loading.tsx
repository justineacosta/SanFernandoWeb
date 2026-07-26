import { ArticleSkeleton } from "@/components/ui/public-skeleton";

/**
 * Detail routes get a whole-page skeleton rather than a Suspense boundary:
 * the page awaits the record before it can render anything, its own title
 * included, so there is no instant part to protect.
 */
export default function Loading() {
  return <ArticleSkeleton what="this notice" />;
}
