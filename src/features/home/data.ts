import {
  CalendarDays,
  FileBadge,
  FileEdit,
  FileText,
  HeartHandshake,
  Store,
} from "lucide-react";
import type { QuickService } from "@/types";

/**
 * The six shortcut cards under the home hero.
 *
 * These lived in `site_items` between migrations 0021 and 0022 and came back
 * here deliberately (design doc 2026-07-22-admin-polish §5): they are links to
 * this site's own routes, so they change when the routes change — a deploy,
 * not an edit. Being code again also means the icon is a component rather than
 * a name resolved at runtime.
 */
export const QUICK_SERVICES: QuickService[] = [
  { title: "Barangay Clearance", ctaLabel: "Apply Online", href: "/services", icon: FileText },
  { title: "Certificate Requests", ctaLabel: "Request Now", href: "/services", icon: FileBadge },
  {
    title: "Set an Appointment",
    ctaLabel: "Book Now",
    href: "/appointments/new",
    icon: CalendarDays,
  },
  {
    title: "File a Complaint",
    ctaLabel: "Submit Online",
    href: "/complaints/new",
    icon: FileEdit,
  },
  { title: "Business Permit", ctaLabel: "Apply Now", href: "/services", icon: Store },
  {
    title: "Social Services Assistance",
    ctaLabel: "Request Now",
    href: "/assistance/new",
    icon: HeartHandshake,
  },
];
