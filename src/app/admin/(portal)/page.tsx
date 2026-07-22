import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth";
import { firstPermittedPath } from "@/lib/admin-nav";
import { ADMIN_NAV_ITEMS } from "@/features/admin/data";

/**
 * /admin is a doorway, not a destination.
 *
 * It used to render a Content Hub: three shortcut cards, a mock "Recent
 * Drafts" list, and a duplicate of the audit log that /admin/audit already
 * owns. The owner removed the panels, which left nothing to land on.
 *
 * Settings carries no permission requirement, so firstPermittedPath always
 * resolves and this cannot loop.
 */
export default async function AdminIndexPage() {
  const user = await requireSessionUser();
  redirect(
    firstPermittedPath(ADMIN_NAV_ITEMS, {
      isSuperAdmin: user.isSuperAdmin,
      permissions: user.permissions,
    }),
  );
}
