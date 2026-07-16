import type { LucideIcon } from "lucide-react";
import type { StaticImageData } from "next/image";

/* ---------------------------------- Navigation --------------------------------- */

export interface NavItem {
  label: string;
  href: string;
}

export interface LinkItem extends NavItem {
  external?: boolean;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface IconNavItem extends NavItem {
  icon: LucideIcon;
  /** Match the route exactly instead of by prefix. */
  exact?: boolean;
  /** Render only for SuperAdmins (page is SuperAdmin-gated). */
  superAdminOnly?: boolean;
  /** Render only for users holding this permission (page is permission-gated). */
  permission?: Permission;
}

/* ------------------------------------ Media ------------------------------------ */

export interface HeroSlide {
  /** Bundled static image (preferred; imported from `src/images/`) or a remote URL. */
  src: StaticImageData | string;
  alt: string;
}

/* ----------------------------------- Contact ----------------------------------- */

export interface Hotline {
  label: string;
  number: string;
  icon: LucideIcon;
}

export interface ContactChannel {
  label: string;
  lines: string[];
  icon: LucideIcon;
}

/* ----------------------------------- Services ---------------------------------- */

export interface QuickService {
  title: string;
  ctaLabel: string;
  href: string;
  icon: LucideIcon;
}

export type ServiceTone = "primary" | "danger";

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: ServiceTone;
  requirementsLabel: string;
  requirements: string[];
  ctaLabel: string;
}

/** A service row as stored in the DB and rendered publicly. `id` is the slug. */
export interface ServiceRecord extends Service {
  isAvailable: boolean;
}

export interface WasteCollectionSlot {
  label: string;
  days: string;
  note: string;
  icon: LucideIcon;
}

/* ----------------------------------- Officials ---------------------------------- */

export type OfficialGroup = "executive" | "council" | "administration";

export interface Official {
  name: string;
  role: string;
  group: OfficialGroup;
  /** Bundled static portrait (preferred; imported from `src/images/officials/`) or a remote URL. */
  photo: StaticImageData | string;
  photoAlt: string;
  email?: string;
  phone?: string;
  badge?: string;
}

/* ------------------------------ News & announcements ---------------------------- */

export interface Announcement {
  title: string;
  /** ISO date, e.g. "2025-05-20" */
  date: string;
  excerpt: string;
  image?: string;
  imageAlt?: string;
  isNew?: boolean;
  urgent?: boolean;
}

export interface CommunityEvent {
  title: string;
  /** ISO date, e.g. "2025-05-25" */
  date: string;
  time: string;
  venue: string;
}

export interface NewsArticle {
  title: string;
  category: string;
  excerpt: string;
  image: string;
  imageAlt: string;
  /** ISO date or a relative label like "2 days ago" */
  dateLabel: string;
  author?: string;
  featured?: boolean;
}

/* ---------------------------------- Statistics ---------------------------------- */

export interface Stat {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
}

/* --------------------------------- Transparency --------------------------------- */

export interface TransparencyDocument {
  title: string;
  category: string;
  /** ISO date */
  date: string;
  icon: LucideIcon;
}

export interface LegislativeDocument {
  /** e.g. "Ordinance No. 05-2024" */
  number: string;
  title: string;
  /** ISO date approved */
  date: string;
  /** Content shown when the row is expanded. Placeholder until CMS/backend. */
  summary: string;
  /** Link to the uploaded PDF/raw file. "#" placeholder until backend upload exists. */
  fileUrl: string;
}

export interface ProjectStatus {
  name: string;
  progress: number;
}

/* ------------------------------------- Admin ------------------------------------ */

export type DraftStatus = "draft" | "in-review";

export interface ContentDraft {
  title: string;
  /** Relative edit label, e.g. "2 hours ago" — becomes a timestamp once backed by an API. */
  editedLabel: string;
  author: string;
  status: DraftStatus;
  icon: LucideIcon;
}

export interface PublishingActivityEntry {
  /** Display timestamp, e.g. "Today, 09:45 AM". */
  dateLabel: string;
  title: string;
  description: string;
  /** Link to the live page, when the item is published and public. */
  liveHref?: string;
  /** Highlight the timeline dot (most recent entry). */
  highlight?: boolean;
}

export interface ContentTypeAction {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Icon housing tone. */
  tone: "primary" | "secondary" | "deep";
}

/* ----------------------- Admin content management (mock CMS) --------------------- */
/* Envelope types wrapping the public entities the admin portal manages. These are    */
/* the de-facto write-side contract for the future backend (see BACKEND_HANDOFF §3E). */

export type AdminContentStatus = "published" | "scheduled" | "draft" | "in-review";
export type AdminServiceStatus = "active" | "inactive";
export type AdminLegislativeStatus = "active" | "under-review" | "archived";
export type AdminEventStatus = "published" | "planning";
/** Spec §3 flow: pending → approved (ready for pickup) → released, or rejected. */
export type ApplicationStatus = "pending" | "approved" | "released" | "rejected";
export type EventCategory =
  | "town-hall"
  | "health-drive"
  | "festival"
  | "youth"
  | "environment"
  | "community";

/** Every status a StatusChip can render. */
export type AdminStatus =
  | AdminContentStatus
  | AdminServiceStatus
  | AdminLegislativeStatus
  | AdminEventStatus
  | ApplicationStatus;

/** Serializable services row for the admin manager (client boundary: icon travels as a name string). */
export interface AdminServiceRow {
  id: string;
  title: string;
  description: string;
  iconName: string;
  tone: ServiceTone;
  requirementsLabel: string;
  ctaLabel: string;
  requirements: string[];
  department: string;
  status: AdminServiceStatus;
  /** ISO timestamp of the last edit. */
  updatedAt: string;
}

export interface AdminEventRecord {
  id: string;
  /** The public entity has no id — the envelope provides it. */
  event: CommunityEvent;
  category: EventCategory;
  status: AdminEventStatus;
  registered?: number;
  capacity?: number;
  volunteers?: number;
  /** Free-form footnote for planning-stage events, e.g. "Registration opens August 1st". */
  note?: string;
}

export interface AdminNewsRecord {
  id: string;
  article: NewsArticle;
  status: AdminContentStatus;
  /** Published posts only. */
  views?: number;
  /** ISO datetime; scheduled posts only. */
  scheduledFor?: string;
  /** ISO date of the last edit. */
  updatedAt: string;
}

export interface AdminLegislativeRecord {
  id: string;
  document: LegislativeDocument;
  /** The public data splits by array; the envelope makes the type explicit. */
  type: "ordinance" | "resolution";
  status: AdminLegislativeStatus;
}

export type TeamRole = "super-admin" | "editor" | "viewer";

export interface AdminTeamMember {
  name: string;
  role: TeamRole;
  initials: string;
  isCurrentUser?: boolean;
}

/* Drawer-form value shapes — the future POST/PUT body contracts. */

export interface ServiceFormValues {
  title: string;
  description: string;
  department: string;
  /** Newline-separated in the form; split into an array server-side. */
  requirements: string;
  status: AdminServiceStatus;
  iconName: string;
  tone: ServiceTone;
}

export interface EventFormValues {
  title: string;
  category: EventCategory;
  /** ISO date. */
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity?: number;
  description: string;
}

export interface NewsPostFormValues {
  title: string;
  category: string;
  excerpt: string;
  body: string;
  status: AdminContentStatus;
  /** Required when status is "scheduled". */
  scheduledFor?: string;
}

export interface LegislativeFormValues {
  type: "ordinance" | "resolution";
  /** e.g. "Ordinance No. 05-2024". */
  number: string;
  title: string;
  /** ISO date. */
  datePassed: string;
  summary: string;
  status: AdminLegislativeStatus;
}

/** The future review-action (PATCH) body. */
export interface ApplicationReviewValues {
  status: "approved" | "rejected";
  /** Required when rejecting; optional when approving. */
  remarks: string;
}

/* ------------------------------------- About ------------------------------------ */

export interface TimelineEntry {
  year: string;
  title: string;
  description: string;
  image: string | StaticImageData;
  /** How the image fills its frame; "contain" suits logos/seals. Defaults to "cover". */
  imageFit?: "cover" | "contain";
  imageAlt: string;
}

export interface Milestone {
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
}

export interface ValueItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

/* ── Auth & permissions (backend plan 1) ─────────────────────────────── */

/** Permission slugs stored in profiles.permissions. Order matches the admin UI. */
export const PERMISSIONS = [
  "process-applications",
  "process-appointments",
  "handle-complaints",
  "handle-assistance",
  "manage-news",
  "manage-officials",
  "manage-transparency",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Display title only — real power is the permissions array (spec §4). */
export type StaffStatusLabel = "staff" | "editor";

/** The signed-in admin user, resolved server-side from Supabase Auth + profiles. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  statusLabel: StaffStatusLabel;
  isSuperAdmin: boolean;
  permissions: Permission[];
  phone: string | null;
}

/** A row in the team-management list (profiles table). */
export interface TeamUser extends SessionUser {
  isActive: boolean;
  isArchived: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A row in the audit_log table. */
export interface AuditEntry {
  id: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

/** Self-service profile edit (own row). */
export interface UpdateMyProfileValues {
  fullName: string;
  phone: string;
}

/** Self-service password change. */
export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
}

/* ── Applications flow (backend plan 2B) ─────────────────────────────── */

/** The public apply form's body. `email` is optional — "" means not given. */
export interface PublicApplicationValues {
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string;
  purpose: string;
  /** Data Privacy Act consent — must be true to submit (persisted). */
  consent: boolean;
}

/** Walk-in encoding adds the service the staff member picked in the drawer. */
export interface WalkInApplicationValues extends PublicApplicationValues {
  serviceId: string;
}

export interface SubmitApplicationResult {
  error: string | null;
  /** e.g. "APP-2026-00001" — present only on success. */
  ticketNo: string | null;
}

/** A queue row for the admin manager: flat and serializable. */
export interface ApplicationRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  serviceId: string;
  serviceTitle: string;
  purpose: string;
  status: ApplicationStatus;
  remarks: string | null;
  reviewedByName: string | null;
  releasedByName: string | null;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  releasedAt: string | null;
  source: "online" | "walk-in";
}

/**
 * A resident-visible ticket. Normalized on purpose: plan 2C adds appointments,
 * complaints and assistance behind this same shape (complaints will omit the
 * narrative — /track shows their status only).
 */
export interface TicketLookupResult {
  ticketNo: string;
  /** Human label for the ticket kind, e.g. "Certificate Application". */
  type: string;
  serviceTitle: string;
  /** Shown on approval — "bring these when you claim". */
  requirements: string[];
  applicantName: string;
  status: ApplicationStatus;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  releasedAt: string | null;
  remarks: string | null;
}
