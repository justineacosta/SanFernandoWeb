import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth";
import { listTeamUsers } from "@/features/admin/queries/users";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function AdminSettingsPage() {
  const currentUser = await requireSuperAdmin();
  const team = await listTeamUsers();
  return <SettingsPanel team={team} currentUser={currentUser} />;
}
