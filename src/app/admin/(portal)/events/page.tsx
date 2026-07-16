import type { Metadata } from "next";
import { EventsManager } from "@/features/admin";

export const metadata: Metadata = {
  title: "Event Calendar",
};

export default function AdminEventsPage() {
  return <EventsManager />;
}
