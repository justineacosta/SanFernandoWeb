import type { Metadata } from "next";
import { AdminSidebar } from "@/features/admin/components/admin-sidebar";
import { AdminTopBar } from "@/features/admin/components/admin-topbar";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s | Barangay Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <AdminSidebar className="fixed left-0 top-0 hidden md:flex" />
      <div className="flex min-h-screen w-full flex-1 flex-col md:ml-64">
        <AdminTopBar />
        <main className="mx-auto w-full max-w-(--container-page) flex-1 p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
