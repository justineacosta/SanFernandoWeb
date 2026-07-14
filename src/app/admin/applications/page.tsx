import type { Metadata } from "next";
import { ApplicationsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Applications",
};

export default function AdminApplicationsPage() {
  return <ApplicationsManager />;
}
