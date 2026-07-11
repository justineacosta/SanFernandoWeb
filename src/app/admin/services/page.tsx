import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { AdminPlaceholder } from "@/features/admin";

export const metadata: Metadata = {
  title: "Services Management",
};

export default function AdminServicesPage() {
  return (
    <AdminPlaceholder
      icon={Landmark}
      title="Services Management"
      description="Manage the citizen services directory, requirements, and fees."
    />
  );
}
