import {
  CalendarClock,
  CalendarDays,
  FileStack,
  Gavel,
  HeartHandshake,
  Inbox,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  PartyPopper,
  Scale,
  Settings,
} from "lucide-react";
import type {
  AdminTeamMember,
  ContentDraft,
  ContentTypeAction,
  EventCategory,
  IconNavItem,
  PublishingActivityEntry,
  TeamRole,
} from "@/types";

export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Dashboard Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Services Management", href: "/admin/services", icon: Landmark, superAdminOnly: true },
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications" },
  { label: "Incident Reports", href: "/admin/complaints", icon: Scale, permission: "handle-complaints" },
  { label: "Appointments", href: "/admin/appointments", icon: CalendarClock, permission: "process-appointments" },
  { label: "Assistance Requests", href: "/admin/assistance", icon: HeartHandshake, permission: "handle-assistance" },
  { label: "Transparency", href: "/admin/transparency", icon: FileStack, permission: "manage-transparency" },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays, permission: "manage-news" },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone, permission: "manage-news" },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const ADMIN_USER = {
  name: "Maria Santos",
  role: "Content Administrator",
  email: "m.santos@brgy-sanfernando.gov.ph",
  phone: "(077) 600-2345",
  avatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDywk9wpYtcWnNA0FWF88gUK3yo2MwAu2MWoBwHgoVtz2CbRQYsTGOP_slCwmRy9aeVnKX2Rf8gaBoZvaT9gXXdU8X2t1_Y8sraK7l6O7WswP_znAxgeJc9gJUxf22BMQckTxHodBglkQIBVboh0ZV720NsiTReQ8DsYiuuxNvX_1E4L6spfUG03Rx-24rhC3h52XJINUNPbjja_RqzXNIYhhtN4x49W-SmbkeKUfUPU0_7uigGsoiMstStrNKmgYP6Vzwc8Lnn3cw",
};

export const CONTENT_TYPE_ACTIONS: ContentTypeAction[] = [
  {
    title: "Ordinance / Resolution",
    description: "Draft official local laws, resolutions, and policy documents for public review.",
    href: "/admin/transparency",
    icon: Gavel,
    tone: "primary",
  },
  {
    title: "Community Event",
    description: "Schedule town halls, health drives, festivals, and public gatherings.",
    href: "/admin/events",
    icon: PartyPopper,
    tone: "secondary",
  },
  {
    title: "News & Announcement",
    description: "Publish immediate updates, advisories, and local news bulletins.",
    href: "/admin/news",
    icon: Newspaper,
    tone: "deep",
  },
];

export const RECENT_DRAFTS: ContentDraft[] = [
  {
    title: "Typhoon Preparedness Advisory",
    editedLabel: "Last edited 2 hours ago by Maria Santos",
    author: "Maria Santos",
    status: "draft",
    icon: Megaphone,
  },
  {
    title: "Resolution No. 45 - Traffic Management",
    editedLabel: "Last edited yesterday by Juan Dela Cruz",
    author: "Juan Dela Cruz",
    status: "in-review",
    icon: Gavel,
  },
  {
    title: "Annual Barangay Fiesta Schedule",
    editedLabel: "Last edited 3 days ago by Ana Reyes",
    author: "Ana Reyes",
    status: "draft",
    icon: CalendarDays,
  },
];

export const DRAFT_STATUS_LABELS: Record<ContentDraft["status"], string> = {
  draft: "Draft",
  "in-review": "In Review",
};

export const PUBLISHING_ACTIVITY: PublishingActivityEntry[] = [
  {
    dateLabel: "Today, 09:45 AM",
    title: "Community Clean-up Drive Announced",
    description: "Published by Admin user 'marcelo_p' under Events.",
    liveHref: "/announcements",
    highlight: true,
  },
  {
    dateLabel: "Yesterday, 14:30 PM",
    title: "Updated Health Center Operating Hours",
    description: "Updated by 'dr_santos' in Announcements.",
  },
  {
    dateLabel: "Oct 12, 10:00 AM",
    title: "Ordinance 2023-04: Noise Regulation",
    description: "Published by Admin user 'sec_general' under Resolutions.",
  },
];

/* ------------------- Section seed data (wraps real public content) ------------------ */

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  "super-admin": "Super Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ADMIN_TEAM: AdminTeamMember[] = [
  { name: "Maria Santos", role: "super-admin", initials: "MS", isCurrentUser: true },
  { name: "Juan Dela Cruz", role: "editor", initials: "JD" },
  { name: "Ana Reyes", role: "viewer", initials: "AR" },
];

