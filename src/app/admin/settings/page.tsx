import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { AdminPlaceholder } from "@/features/admin";

export const metadata: Metadata = {
  title: "User Settings",
};

export default function AdminSettingsPage() {
  return (
    <AdminPlaceholder
      icon={Settings}
      title="User Settings"
      description="Manage administrator accounts, roles, and portal preferences."
    />
  );
}
