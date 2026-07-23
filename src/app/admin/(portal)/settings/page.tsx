import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth";
import { SettingsPanel } from "@/features/admin";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function AdminSettingsPage() {
  const currentUser = await requireSessionUser();
  return <SettingsPanel currentUser={currentUser} />;
}
