import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { AppointmentsManager } from "@/features/admin";
import { listAppointments } from "@/features/admin/queries/appointments";

export const metadata: Metadata = {
  title: "Appointments",
};

export default async function AdminAppointmentsPage() {
  await requirePermission("process-appointments");
  const appointments = await listAppointments();
  return <AppointmentsManager appointments={appointments} />;
}
