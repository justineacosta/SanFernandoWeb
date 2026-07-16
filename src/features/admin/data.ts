import {
  CalendarDays,
  Gavel,
  IdCard,
  Inbox,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  PartyPopper,
  Scale,
  ScrollText,
  Settings,
} from "lucide-react";
import type {
  AdminApplicationRecord,
  AdminEventRecord,
  AdminLegislativeRecord,
  AdminNewsRecord,
  AdminServiceRecord,
  AdminTeamMember,
  ContentDraft,
  ContentTypeAction,
  EventCategory,
  IconNavItem,
  PublishingActivityEntry,
  TeamRole,
} from "@/types";
import { SERVICES } from "@/features/services/data";
import { UPCOMING_EVENTS } from "@/features/home/data";
import { FEATURED_ARTICLE, NEWS_ARTICLES } from "@/features/announcements/data";
import { ORDINANCES, RESOLUTIONS } from "@/features/transparency/data";

export const ADMIN_NAV_ITEMS: IconNavItem[] = [
  { label: "Dashboard Overview", href: "/admin", icon: LayoutDashboard, exact: true },
  { label: "Services Management", href: "/admin/services", icon: Landmark, superAdminOnly: true },
  { label: "Applications", href: "/admin/applications", icon: Inbox, permission: "process-applications" },
  { label: "Ordinance & Resolution", href: "/admin/legislative", icon: Scale },
  { label: "Event Calendar", href: "/admin/events", icon: CalendarDays },
  { label: "News & Announcements", href: "/admin/news", icon: Megaphone },
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
    href: "/admin/legislative",
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

/** Mock-only services demonstrating extra table states (not shown on the public site). */
const MOCK_SERVICES: AdminServiceRecord[] = [
  {
    id: "mock-senior-citizen-id",
    service: {
      id: "mock-senior-citizen-id",
      title: "Senior Citizen ID Assistance",
      description:
        "Assistance with OSCA ID registration and issuance for residents aged 60 and above.",
      icon: IdCard,
      tone: "primary",
      requirementsLabel: "View Requirements",
      requirements: [
        "Birth certificate or valid government ID",
        "Recent 1x1 ID picture",
        "Proof of residency",
      ],
      ctaLabel: "Registration and ID issuance",
    },
    department: "Office of Senior Citizens Affairs (OSCA)",
    status: "inactive",
    updatedAt: "2025-04-02",
  },
  {
    id: "mock-cedula",
    service: {
      id: "mock-cedula",
      title: "Community Tax Certificate (Cedula)",
      description:
        "Issuance of community tax certificates for employment, business, and legal transactions.",
      icon: ScrollText,
      tone: "primary",
      requirementsLabel: "View Requirements",
      requirements: [
        "Valid government ID",
        "Accomplished CTC form",
        "Basic community tax: ₱5.00 plus additional levies",
      ],
      ctaLabel: "Same-day issuance",
    },
    department: "Office of the Barangay Treasurer",
    status: "active",
    updatedAt: "2025-05-10",
  },
];

const SERVICE_DEPARTMENTS: Record<string, string> = {
  "barangay-clearance": "Office of the Barangay Secretary",
  "business-permit": "Office of the Barangay Treasurer",
  "certificate-of-indigency": "Barangay Social Welfare Desk",
  "blotter-complaints": "Lupong Tagapamayapa",
};

const SERVICE_UPDATED_AT: Record<string, string> = {
  "barangay-clearance": "2025-05-12",
  "business-permit": "2025-04-28",
  "certificate-of-indigency": "2025-03-15",
  "blotter-complaints": "2025-05-01",
};

export const ADMIN_SERVICES: AdminServiceRecord[] = [
  ...SERVICES.map((service) => ({
    id: service.id,
    service,
    department: SERVICE_DEPARTMENTS[service.id] ?? "Office of the Barangay Secretary",
    status: "active" as const,
    updatedAt: SERVICE_UPDATED_AT[service.id] ?? "2025-05-01",
  })),
  ...MOCK_SERVICES,
];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  "town-hall": "Town Hall",
  "health-drive": "Health Drive",
  festival: "Festival",
  youth: "Youth",
  environment: "Environment",
  community: "Community",
};

const EVENT_META: Record<
  string,
  Pick<AdminEventRecord, "category" | "registered" | "capacity" | "volunteers">
> = {
  "Medical & Dental Mission": { category: "health-drive", registered: 120, capacity: 200 },
  "Youth Leadership Seminar": { category: "youth", registered: 45, capacity: 60 },
  "Environment Clean-up Drive": { category: "environment", volunteers: 30 },
  "Senior Citizens Gathering": { category: "community", registered: 80, capacity: 100 },
};

export const ADMIN_EVENTS: AdminEventRecord[] = [
  ...UPCOMING_EVENTS.map((event, index) => ({
    id: `evt-${index + 1}`,
    event,
    status: "published" as const,
    ...(EVENT_META[event.title] ?? { category: "community" as const }),
  })),
  {
    id: "evt-fiesta-2025",
    event: {
      title: "San Fernando Grand Fiesta 2025",
      date: "2025-08-28",
      time: "All Day",
      venue: "Entire Barangay Jurisdiction",
    },
    category: "festival",
    status: "planning",
    note: "Registration opens August 1st",
  },
];

export const ADMIN_NEWS: AdminNewsRecord[] = [
  {
    id: "news-health-mission",
    article: FEATURED_ARTICLE,
    status: "published",
    views: 3400,
    updatedAt: "2024-10-24",
  },
  {
    id: "news-q4-town-hall",
    article: NEWS_ARTICLES[0],
    status: "published",
    views: 1200,
    updatedAt: "2024-10-22",
  },
  {
    id: "news-tree-planting",
    article: NEWS_ARTICLES[1],
    status: "published",
    views: 860,
    updatedAt: "2024-10-20",
  },
  {
    id: "news-fiesta-schedule-draft",
    article: {
      title: "Annual Barangay Fiesta Schedule and Guidelines",
      category: "Events",
      excerpt: "",
      image: "",
      imageAlt: "",
      dateLabel: "",
    },
    status: "draft",
    updatedAt: "2024-10-25",
  },
  {
    id: "news-anti-rabies-drive",
    article: {
      title: "Free Anti-Rabies Vaccination Drive for Pets",
      category: "Public Health",
      excerpt:
        "Details regarding the upcoming free anti-rabies vaccination drive for dogs and cats, in coordination with the Municipal Agriculture Office.",
      image:
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBQMEWS1CFwllE8d9raqgMitrZe3lxxzWXQ3Bcl2I1HXP7eHqHEK-hqYJgyWkH3UD0brZRExGSa6WZnAViKeIXMh8s0B4saCQjR7DrQUVlkYtWz7hleSkf5wufO4vDDEmqkDlv8z6bMCyl0t04YwZws14Lx0jGXLoOWgFmGq-2O9kHlhu5ab9-ojY4N96RIQVx5QlNdldjOaujdC7lDoqUfEQxtEysVrhbjng7EVEHi9Z_d91NIpXXDZFAILNbLfieTKvuefXZDugY",
      imageAlt: "Health workers preparing vaccines at an outdoor station",
      dateLabel: "Oct 26, 2024",
    },
    status: "scheduled",
    scheduledFor: "2024-10-26T08:00:00",
    updatedAt: "2024-10-23",
  },
];

export const ADMIN_LEGISLATIVE: AdminLegislativeRecord[] = [
  ...ORDINANCES.map((document, index) => ({
    id: `ord-${index + 1}`,
    document,
    type: "ordinance" as const,
    status: "active" as const,
  })),
  ...RESOLUTIONS.map((document, index) => ({
    id: `res-${index + 1}`,
    document,
    type: "resolution" as const,
    status: "active" as const,
  })),
  {
    id: "ord-draft-anti-littering",
    document: {
      number: "Ordinance No. 01-2025",
      title: "Barangay Anti-Littering and Public Cleanliness Code",
      date: "2025-02-10",
      summary:
        "Draft ordinance consolidating anti-littering rules, sidewalk obstruction penalties, and purok-level cleanliness inspections into a single code. Under committee review.",
      fileUrl: "#",
    },
    type: "ordinance",
    status: "under-review",
  },
  {
    id: "res-old-traffic-routing",
    document: {
      number: "Resolution No. 02-2019",
      title: "Old Traffic Routing Scheme for Fiesta Season",
      date: "2019-01-15",
      summary:
        "Previous one-way routing scheme for the fiesta season, superseded by Resolution No. 04-2024.",
      fileUrl: "#",
    },
    type: "resolution",
    status: "archived",
  },
];

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

/* ------------------------- Certificate applications ------------------------- */

const CERTIFICATE_SERVICE_IDS = new Set([
  "barangay-clearance",
  "business-permit",
  "certificate-of-indigency",
]);

/** Certificate-issuing subset of the public catalog — select options + display titles. */
export const CERTIFICATE_SERVICES: { id: string; title: string }[] = SERVICES.filter(
  (service) => CERTIFICATE_SERVICE_IDS.has(service.id),
).map((service) => ({ id: service.id, title: service.title }));

/** Display title for an application's serviceId; falls back to the raw id. */
export function certificateTitle(serviceId: string): string {
  return CERTIFICATE_SERVICES.find((service) => service.id === serviceId)?.title ?? serviceId;
}

/**
 * Fictional applicants (names distinct from the admin team and real officials);
 * ordered newest-first. 4 pending / 3 approved / 2 rejected.
 */
export const ADMIN_APPLICATIONS: AdminApplicationRecord[] = [
  {
    id: "app-0148",
    referenceNo: "APP-2025-0148",
    applicantName: "Erlinda Buenaventura",
    contactNumber: "(077) 600-4181",
    email: "e.buenaventura@example.com",
    address: "Purok 2, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Employment requirement for a job application in Laoag City.",
    dateApplied: "2025-06-14",
    status: "pending",
  },
  {
    id: "app-0147",
    referenceNo: "APP-2025-0147",
    applicantName: "Marco Villanueva",
    contactNumber: "(077) 600-4172",
    address: "Purok 5, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "Renewal recommendation for an existing sari-sari store permit.",
    dateApplied: "2025-06-13",
    status: "pending",
  },
  {
    id: "app-0146",
    referenceNo: "APP-2025-0146",
    applicantName: "Cristina Agbayani",
    contactNumber: "(077) 600-4163",
    email: "cagbayani@example.com",
    address: "Purok 1, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose:
      "Medical assistance application with the Municipal Social Welfare and Development Office.",
    dateApplied: "2025-06-11",
    status: "pending",
  },
  {
    id: "app-0145",
    referenceNo: "APP-2025-0145",
    applicantName: "Ferdinand Salazar",
    contactNumber: "(077) 600-4154",
    address: "Purok 7, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Requirement for opening a bank account.",
    dateApplied: "2025-06-09",
    status: "pending",
  },
  {
    id: "app-0144",
    referenceNo: "APP-2025-0144",
    applicantName: "Teresita Manuel",
    contactNumber: "(077) 600-4145",
    email: "t.manuel@example.com",
    address: "Purok 4, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose: "Scholarship application for her daughter's college tuition assistance.",
    dateApplied: "2025-06-05",
    status: "approved",
    remarks: "Household verified in the RBI; indigency confirmed.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-06-06",
  },
  {
    id: "app-0143",
    referenceNo: "APP-2025-0143",
    applicantName: "Rolando Pascua",
    contactNumber: "(077) 600-4136",
    address: "Purok 6, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "New barbershop business registration with the municipal licensing office.",
    dateApplied: "2025-06-02",
    status: "rejected",
    remarks:
      "Proposed site is within a residential-only zone; applicant advised to secure a zoning clearance first.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-06-03",
  },
  {
    id: "app-0142",
    referenceNo: "APP-2025-0142",
    applicantName: "Josefina Alcantara",
    contactNumber: "(077) 600-4127",
    email: "jalcantara@example.com",
    address: "Purok 3, Barangay San Fernando",
    serviceId: "barangay-clearance",
    purpose: "Police clearance prerequisite for overseas employment processing.",
    dateApplied: "2025-05-28",
    status: "approved",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-29",
  },
  {
    id: "app-0141",
    referenceNo: "APP-2025-0141",
    applicantName: "Benjamin Corpuz",
    contactNumber: "(077) 600-4118",
    address: "Purok 5, Barangay San Fernando",
    serviceId: "certificate-of-indigency",
    purpose: "Tuition fee discount application at Ilocos Norte National High School.",
    dateApplied: "2025-05-22",
    status: "rejected",
    remarks: "Applicant's household income exceeds the indigency threshold per CBMS 2024 records.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-24",
  },
  {
    id: "app-0140",
    referenceNo: "APP-2025-0140",
    applicantName: "Lourdes Domingo",
    contactNumber: "(077) 600-4109",
    email: "l.domingo@example.com",
    address: "Purok 1, Barangay San Fernando",
    serviceId: "business-permit",
    purpose: "Business permit recommendation for a home-based bakery.",
    dateApplied: "2025-05-19",
    status: "approved",
    remarks: "Sanitary permit already on file; endorsed to the municipal licensing office.",
    reviewedBy: "Maria Santos",
    reviewedAt: "2025-05-20",
  },
];
