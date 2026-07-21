import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Admin portal 404. Lives inside the (portal) route group so it renders within
 * that layout — sidebar and topbar included — leaving the staff member a way
 * out rather than a dead end. The root not-found.tsx is unusable here: it
 * renders PublicShell, i.e. the public header, footer, and hotlines.
 *
 * This is also what an unauthorized page load renders (requirePermission /
 * requireSuperAdmin call notFound()), so the copy must not mention permissions.
 * Saying "you don't have access to this" would confirm the module exists,
 * which is the whole thing the 404 is here to avoid.
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span
        aria-hidden="true"
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-ink-500"
      >
        <FileQuestion className="h-8 w-8" />
      </span>
      <p className="mb-2 text-sm font-bold uppercase tracking-widest text-brand-700">
        404 — Page Not Found
      </p>
      <h1 className="mb-3 font-display text-2xl font-semibold tracking-tight text-ink-900 md:text-3xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mb-8 max-w-md text-ink-600">
        The page may have been moved or renamed. Use the menu to pick another section of
        the portal.
      </p>
      <Button href="/admin" variant="primary">
        Back to Dashboard
      </Button>
    </div>
  );
}
