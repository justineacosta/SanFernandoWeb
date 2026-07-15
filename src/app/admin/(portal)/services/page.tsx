import type { Metadata } from "next";
import { ServicesManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Services Management",
};

export default function AdminServicesPage() {
  return <ServicesManager />;
}
