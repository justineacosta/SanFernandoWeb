import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getNotificationSnapshot } from "@/features/admin/queries/notifications";
import { AdminShell } from "@/features/admin/components/admin-shell";
import { AdminUserProvider } from "@/features/admin/components/admin-user-context";
import { NotificationProvider } from "@/features/admin/components/notification-provider";
import { IdleTimeout } from "@/features/admin/components/idle-timeout";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  // Seeds AdminShell's initial state so a collapsed sidebar renders collapsed
  // on first paint rather than snapping shut after hydration.
  const cookieStore = await cookies();
  const collapsed = cookieStore.get("sf-admin-sidebar")?.value === "collapsed";
  const notifications = await getNotificationSnapshot(user);

  return (
    <AdminUserProvider userId={user.id}>
      <NotificationProvider initial={notifications}>
        <AdminShell user={user} defaultCollapsed={collapsed}>
          {children}
        </AdminShell>
        {/* Sibling of AdminShell, not a child: a fixed overlay inside the
            backdrop-filter chrome would be positioned against it, not the
            viewport. NotificationProvider renders no DOM of its own, so
            nesting IdleTimeout inside it changes nothing about that. */}
        <IdleTimeout />
      </NotificationProvider>
    </AdminUserProvider>
  );
}
