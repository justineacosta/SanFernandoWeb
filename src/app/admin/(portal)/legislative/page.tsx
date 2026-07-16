import type { Metadata } from "next";
import { LegislativeManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Ordinance & Resolution",
};

export default function AdminLegislativePage() {
  return <LegislativeManager />;
}
