import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { AdminTopBar } from "@/features/admin/components/admin-topbar";

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-white">
      <AdminSidebar
        className="fixed left-0 top-0 hidden md:flex"
        isSuperAdmin={user.isSuperAdmin}
        permissions={user.permissions}
      />
      <div className="flex min-h-screen w-full flex-1 flex-col md:ml-64">
        <AdminTopBar user={user} />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
