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

/** Sidebar section. Labels and render order live in `src/lib/admin-nav.ts`. */
export type AdminNavGroup = "requests" | "content" | "system";

export interface IconNavItem extends NavItem {
  icon: LucideIcon;
  /** Match the route exactly instead of by prefix. */
  exact?: boolean;
  /** Render only for SuperAdmins (page is SuperAdmin-gated). */
  superAdminOnly?: boolean;
  /** Render only for users holding this permission (page is permission-gated). */
  permission?: Permission;
  /** Sidebar section. See ADMIN_NAV_GROUP_LABELS in src/lib/admin-nav.ts. */
  group: AdminNavGroup;
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

export type OfficialGroup = "executive" | "council" | "administration" | "members";

/**
 * Public directory card. `photoUrl` is always resolved — publishing requires a
 * portrait. `email`/`phone` belong here, not only on the detail type: the
 * portrait card already renders mailto/tel icons today.
 */
export interface OfficialListItem {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photoUrl: string;
  photoAlt: string;
  email: string | null;
  phone: string | null;
}

/** Public profile page (`/officials/[slug]`). */
export interface OfficialDetail extends OfficialListItem {
  term: string;
  bio: string;
  achievements: PublicAchievement[];
}

/** Drawer editor POST/PUT body. */
export interface OfficialValues {
  name: string;
  role: string;
  group: OfficialGroup;
  badge: string | null;
  photoPath: string | null;
  photoAlt: string;
  term: string;
  email: string | null;
  phone: string | null;
  bio: string;
}

/** Admin table row. */
export interface AdminOfficialRow extends ArchiveMeta {
  id: string;
  slug: string;
  name: string;
  role: string;
  group: OfficialGroup;
  photoUrl: string | null;
  sortOrder: number;
  status: ContentStatus;
}

/** The three text fields of an achievement, as the drawer editor saves them. */
export interface AchievementValues {
  title: string;
  description: string;
  dateLabel: string;
}

/** One achievement row in the admin drawer editor. `photos[].src` is render-ready. */
export interface AdminAchievement extends AchievementValues {
  id: string;
  isVisible: boolean;
  photos: GalleryPhoto[];
}

/** One achievement as the public timeline renders it. `photos[].src` is render-ready. */
export interface PublicAchievement extends AchievementValues {
  id: string;
  photos: GalleryPhoto[];
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
  /** Resolved public URL of the optional cover image. */
  image?: string;
  imageAlt?: string;
}

/* ── News content management (backend plan 3) ─────────────────────────── */

export type ContentStatus = "draft" | "in-review" | "published" | "archived";

/**
 * Archive provenance (migration 0020), carried by every admin row type whose
 * table has an Archived view.
 *
 * Both are null on a live record, and null on anything archived before the
 * migration — the view says "archived earlier" rather than inventing a date.
 * The audit log holds the same facts, but it is SuperAdmin-only, so the staff
 * member looking at the Archived view could not otherwise see them.
 */
export interface ArchiveMeta {
  /** Manila calendar date (YYYY-MM-DD). */
  archivedAt: string | null;
  archivedByName: string | null;
}

export interface NewsCategoryRow {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
export interface NewsCategoryValues {
  label: string;
}

export interface GalleryPhoto {
  id: string;
  src: string; // render-ready URL — every producer resolves it with photoUrl()
  alt: string;
}

/** Public news card / feed item. */
export interface NewsArticleListItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  coverSrc: string | null;
  coverAlt: string;
  dateLabel: string;
  isNew: boolean;
  author: string | null;
}
/** Public news detail (slug page). */
export interface NewsArticleDetail extends NewsArticleListItem {
  body: string;
  photos: GalleryPhoto[];
}

/** Admin list rows. */
export interface AdminNewsArticleRow extends ArchiveMeta {
  id: string;
  slug: string;
  title: string;
  category: string;
  categoryId: string;
  excerpt: string;
  status: ContentStatus;
  coverSrc: string | null;
  coverAlt: string;
  photoCount: number;
  updatedLabel: string;
  publishedLabel: string | null;
}
export interface AdminAnnouncementRow extends ArchiveMeta {
  id: string;
  title: string;
  date: string;
  excerpt: string;
  urgent: boolean;
  status: ContentStatus;
  imageSrc: string | null;
  imageAlt: string;
  updatedLabel: string;
}
export interface AdminEventRow extends ArchiveMeta {
  id: string;
  title: string;
  category: EventCategory;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: number | null;
  description: string;
  status: ContentStatus;
  coverSrc: string | null;
  coverAlt: string;
}

/** Drawer form values. */
export interface NewsArticleValues {
  title: string;
  slug: string;
  categoryId: string;
  excerpt: string;
  body: string;
}
export interface AnnouncementValues {
  title: string;
  date: string;
  excerpt: string;
  urgent: boolean;
  imageSrc: string | null;
  imageAlt: string;
}
export interface EventValues {
  title: string;
  category: EventCategory;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  capacity: number | null;
  description: string;
  coverSrc: string | null;
  coverAlt: string;
}

/* ---------------------------------- Statistics ---------------------------------- */

export interface Stat {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
}

/* --------------------------------- Transparency --------------------------------- */

/* ── Transparency (Plan 4) ───────────────────────────────────────────────── */

export type LegislativeType = "ordinance" | "resolution";

/** A published ordinance/resolution as the public tables and archive render it. */
export interface LegislativeListItem {
  id: string;
  slug: string;
  docType: LegislativeType;
  number: string;
  title: string;
  /** ISO date approved, or null when the document is pending approval. */
  dateApproved: string | null;
  /** Resolved public URL, or null when no PDF is attached yet. */
  fileUrl: string | null;
  fileSizeBytes: number | null;
}

/** Detail-page shape: the list item plus the expanded summary. */
export interface LegislativeDetail extends LegislativeListItem {
  summary: string;
}

/** A published document in the disclosure/latest-uploads tables. */
export interface TransparencyDocumentItem {
  id: string;
  title: string;
  categoryLabel: string;
  /** Icon name string — resolve with resolveIcon(); never store a component. */
  categoryIconName: string;
  /** ISO date released, or null when undated. */
  dateReleased: string | null;
  files: TransparencyFile[];
}

export interface TransparencyProjectItem {
  id: string;
  name: string;
  progress: number;
  /** ISO date, or null when undated. */
  date: string | null;
  files: TransparencyFile[];
}

/** A file attached to a document or project (public, resolved for download). */
export interface TransparencyFile {
  id: string;
  url: string;
  /** Display label, e.g. the original-ish "Document 1" or a page label. */
  label: string;
  mime: string;
  sizeBytes: number;
}

export type UploadBrowseType = "legislative" | "document" | "project";

/** One row in the unified /transparency/uploads browse. */
export interface UploadBrowseItem {
  key: string; // `${type}:${id}`
  type: UploadBrowseType;
  title: string;
  date: string | null;
  /** Detail link for legislative; null for document/project (files render inline). */
  href: string | null;
  files: TransparencyFile[];
  /** Projects only, else null. */
  progress: number | null;
}

export interface TransparencyCategoryRow {
  id: string;
  label: string;
  iconName: string;
  sortOrder: number;
  isActive: boolean;
}

/* Admin rows (serializable — cross the client boundary into the manager). */

export interface AdminLegislativeRow extends ArchiveMeta {
  id: string;
  slug: string;
  docType: LegislativeType;
  number: string;
  title: string;
  dateApproved: string | null;
  status: ContentStatus;
  hasFile: boolean;
  fileUrl: string | null;
}

export interface AdminTransparencyDocumentRow extends ArchiveMeta {
  id: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  dateReleased: string | null;
  status: ContentStatus;
  fileCount: number;
}

export interface AdminTransparencyProjectRow extends ArchiveMeta {
  id: string;
  name: string;
  progress: number;
  sortOrder: number;
  status: ContentStatus;
  date: string | null;
  fileCount: number;
}

/* Drawer-form body shapes (the write-side contract). */

export interface LegislativeValues {
  docType: LegislativeType;
  number: string;
  title: string;
  /** ISO date, or null while pending approval. The action stores an empty
   *  string from the date input as SQL NULL. */
  dateApproved: string | null;
  summary: string;
  /** Storage object path, or null. Set by the uploader, persisted by the action. */
  filePath: string | null;
  fileSizeBytes: number | null;
}

export interface TransparencyDocumentValues {
  title: string;
  categoryId: string;
  /** ISO date, or null when undated. The action stores an empty string from
   *  the date input as SQL NULL. */
  dateReleased: string | null;
}

export interface TransparencyProjectValues {
  name: string;
  progress: number;
  /** ISO date, or null when undated. The action stores an empty string from
   *  the date input as SQL NULL. */
  date: string | null;
}

export interface TransparencyCategoryValues {
  label: string;
  iconName: string;
}

/* ------------------------------------- Admin ------------------------------------ */

/* ----------------------- Admin content management (mock CMS) --------------------- */
/* Envelope types wrapping the public entities the admin portal manages. These are    */
/* the de-facto write-side contract for the future backend (see BACKEND_HANDOFF §3E). */

export type AdminContentStatus = "published" | "scheduled" | "draft" | "in-review";
export type AdminServiceStatus = "active" | "inactive";
export type AdminEventStatus = "published" | "planning";
/** Spec §3 flow: pending → approved (ready for pickup) → released, or rejected. */
export type ApplicationStatus = "pending" | "approved" | "released" | "rejected";
/** Spec §3 flow: pending → confirmed (final date/time) → completed, or declined. */
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "declined";
/** Spec §3 flow: received → under review → resolved, or dismissed. */
export type ComplaintStatus = "received" | "under-review" | "resolved" | "dismissed";
/** Spec §3 flow: pending → under review → granted, or declined. */
export type AssistanceStatus = "pending" | "under-review" | "granted" | "declined";
/** Any status a ticket of any kind can hold. */
export type TicketStatus =
  | ApplicationStatus
  | AppointmentStatus
  | ComplaintStatus
  | AssistanceStatus;
/** Which table a ticket number belongs to. Matches `tickets_view.kind`. */
export type TicketKind = "application" | "appointment" | "complaint" | "assistance";
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
  | ContentStatus
  | AdminServiceStatus
  | AdminEventStatus
  | ApplicationStatus
  | AppointmentStatus
  | ComplaintStatus
  | AssistanceStatus
  | InquiryStatus;

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

/* --------------------------- Site content CMS (plan 9) -------------------------- */
/* The editable Home and About blocks.                                              */
/*                                                                                  */
/* This union NO LONGER mirrors the SQL `site_block` enum exactly: migration 0022    */
/* removed Quick Services from the CMS, and Postgres cannot drop an enum value, so   */
/* 'quick_services' survives in the database as an unreachable label. Every value    */
/* HERE must still exist in the enum — the drift only runs one way.                  */

export const SITE_BLOCKS = [
  "hero_slides",
  "glance_stats",
  "involvement_items",
  "core_values",
  "history_entries",
  "milestones",
] as const;

export type SiteBlock = (typeof SITE_BLOCKS)[number];

/** Singleton text blocks, keyed by dotted path (site_blocks.key). */
export const SITE_BLOCK_KEYS = [
  "about.mission",
  "about.vision",
  "about.captain_message",
  "home.cta_image",
] as const;

export type SiteBlockKey = (typeof SITE_BLOCK_KEYS)[number];

/**
 * Drawer body for one collection item. Three generic text slots whose meaning is
 * fixed per block (see the table in migration 0021, and SITE_BLOCK_FIELDS).
 *
 * The image FILE is deliberately absent: it lives in component state so the
 * autosave snapshot stays text-only by construction (sub-projects 7 and 8).
 */
export interface SiteItemValues {
  iconName: string | null;
  label: string | null;
  value: string | null;
  body: string | null;
  href: string | null;
  imageAlt: string | null;
  imageFit: "cover" | "contain" | null;
}

/**
 * An item as the manager sees it. Note there is no ArchiveMeta: site content has
 * no draft/published/archived lifecycle (design §2.3), so it has no archived
 * state to carry. That absence is a decision, not an oversight.
 */
export interface AdminSiteItemRow extends SiteItemValues {
  id: string;
  block: SiteBlock;
  sortOrder: number;
  imagePath: string | null;
  imageUrl: string | null;
}

/* ── Auth & permissions (backend plan 1) ─────────────────────────────── */

/** Permission slugs stored in profiles.permissions. Order matches the admin UI. */
export const PERMISSIONS = [
  "process-applications",
  "process-appointments",
  "handle-complaints",
  "handle-assistance",
  "handle-inquiries",
  "manage-news",
  "manage-officials",
  "manage-transparency",
  "manage-site-content",
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

/**
 * Controlled action classes for the audit log — the Action Type dropdown's
 * values. Mirrors the `public.audit_action` enum (migration 0014); the two must
 * change together.
 */
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "archive",
  "restore",
  "publish",
  "unpublish",
  "save_draft",
  "approve",
  "reject",
  "login",
  "logout",
  "file_upload",
  "file_delete",
  "role_change",
  "password_reset",
  "reorder",
] as const;

export type AuditActionType = (typeof AUDIT_ACTIONS)[number];

/** A row in the audit_log table. */
export interface AuditEntry {
  id: number;
  actorName: string;
  actionType: AuditActionType;
  /** Human sentence, e.g. "archived announcement" — secondary to actionType. */
  action: string;
  entityType: string;
  entityId: string | null;
  /** Human name of the target, captured at write time. */
  entityLabel: string | null;
  /** Free-text extra context (staff remarks). Never the entity name. */
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
 * A resident-visible ticket, normalized across all four kinds. Everything here
 * is safe to render publicly — in particular a complaint's narrative and
 * respondent are NEVER loaded into this shape (spec §3: complaints show status
 * only). `closedAt` is the stage-2 timestamp under whatever each table calls it
 * (released_at / completed_at / closed_at / decided_at).
 */
export interface TicketLookupResult {
  kind: TicketKind;
  ticketNo: string;
  /** Human label for the ticket kind, e.g. "Certificate Application". */
  type: string;
  /** The service, category, or flow name shown under the ticket number. */
  serviceTitle: string;
  /** Applications only — "bring these when you claim". Empty for other kinds. */
  requirements: string[];
  applicantName: string;
  status: TicketStatus;
  /** Manila calendar dates (YYYY-MM-DD). */
  submittedAt: string;
  reviewedAt: string | null;
  closedAt: string | null;
  remarks: string | null;
  /** Appointments only: the confirmed schedule once staff set it, e.g. "20 July 2026, morning". */
  scheduleNote: string | null;
}

/* ── Ticketing flows 2C: appointments, complaints, assistance ─────────── */

/** Fields every public ticket form collects (spec §3 "common form fields"). */
export interface PublicTicketValues {
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string;
  /** Data Privacy Act consent — must be true to submit (persisted). */
  consent: boolean;
}

export type AppointmentPeriod = "am" | "pm";

export interface PublicAppointmentValues extends PublicTicketValues {
  purpose: string;
  /** Manila calendar date (YYYY-MM-DD) from a native date input. */
  preferredDate: string;
  preferredPeriod: AppointmentPeriod;
}
export type WalkInAppointmentValues = PublicAppointmentValues;

export interface PublicComplaintValues extends PublicTicketValues {
  /** Optional — a resident may report an incident without naming anyone. */
  respondent: string;
  incidentDate: string;
  location: string;
  narrative: string;
}
export type WalkInComplaintValues = PublicComplaintValues;

export interface PublicAssistanceValues extends PublicTicketValues {
  categoryId: string;
  details: string;
}
export type WalkInAssistanceValues = PublicAssistanceValues;

/** Every public ticket action returns this. Mirrors SubmitApplicationResult. */
export interface SubmitTicketResult {
  error: string | null;
  /** e.g. "CMP-2026-00001" — present only on success. */
  ticketNo: string | null;
}

/** Queue row for the appointments manager: flat and serializable. */
export interface AppointmentRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  purpose: string;
  /** Manila calendar dates (YYYY-MM-DD). */
  preferredDate: string;
  preferredPeriod: AppointmentPeriod;
  confirmedDate: string | null;
  confirmedPeriod: AppointmentPeriod | null;
  status: AppointmentStatus;
  remarks: string | null;
  reviewedByName: string | null;
  completedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
  source: "online" | "walk-in";
}

/** Queue row for the complaints manager. Staff-only: carries the narrative. */
export interface ComplaintRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  respondent: string | null;
  incidentDate: string;
  location: string;
  narrative: string;
  status: ComplaintStatus;
  remarks: string | null;
  reviewedByName: string | null;
  closedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  closedAt: string | null;
  source: "online" | "walk-in";
}

/** Queue row for the assistance manager. */
export interface AssistanceRow {
  id: string;
  ticketNo: string;
  firstName: string;
  lastName: string;
  address: string;
  contactNumber: string;
  email: string | null;
  categoryId: string;
  categoryLabel: string;
  details: string;
  status: AssistanceStatus;
  remarks: string | null;
  reviewedByName: string | null;
  decidedByName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  decidedAt: string | null;
  source: "online" | "walk-in";
}

/** Staff decision bodies. Remarks are required on every negative outcome. */
export interface AppointmentReviewValues {
  status: "confirmed" | "declined";
  /**
   * Required when confirming, "" when declining — staff may confirm a slot other
   * than the one the resident asked for. The action nulls both columns on a
   * decline, so a declined row never carries a phantom schedule.
   */
  confirmedDate: string;
  confirmedPeriod: AppointmentPeriod | "";
  remarks: string;
}
export interface ComplaintReviewValues {
  status: "under-review" | "dismissed";
  remarks: string;
}
export interface ComplaintCloseValues {
  status: "resolved" | "dismissed";
  remarks: string;
}
export interface AssistanceReviewValues {
  status: "under-review" | "declined";
  remarks: string;
}
export interface AssistanceDecisionValues {
  status: "granted" | "declined";
  remarks: string;
}

/** SuperAdmin-managed picker list backing the assistance form. */
export interface AssistanceCategoryRow {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}
export interface AssistanceCategoryValues {
  label: string;
}

/* ── Contact inquiries & alert subscribers (migration 0019) ───────────── */

/**
 * Mirrors the `public.inquiry_status` enum. `in_progress` keeps the underscore
 * the enum was created with rather than the hyphen the ticket statuses use —
 * spelling it two ways would mean translating on every read and every write to
 * win nothing but symmetry.
 *
 * An inquiry is not a ticket: there is no number, nothing to track publicly, and
 * no resident-facing state machine. It arrives, someone picks it up, it is
 * answered — or it is spam and gets closed unanswered.
 */
export type InquiryStatus = "new" | "in_progress" | "answered" | "closed";

/** The /contact form's body. `phone` is optional — "" means not given. */
export interface PublicInquiryValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** One of INQUIRY_SUBJECTS in `src/features/contact/data.ts`. */
  subject: string;
  message: string;
  /** Data Privacy Act consent — must be true to submit. */
  consent: boolean;
}

/** An inbox row for the admin manager: flat and serializable. */
export interface InquiryRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  /** The subject's display label, resolved against INQUIRY_SUBJECTS. */
  subjectLabel: string;
  message: string;
  status: InquiryStatus;
  staffNote: string;
  /**
   * Resolved through the `handled_by` foreign key, not a denormalised column
   * like the ticket tables' `reviewed_by_name`. Deleting the account nulls it;
   * the audit log is the durable record of who did what.
   */
  handledByName: string | null;
  /** Manila calendar dates (YYYY-MM-DD). */
  handledAt: string | null;
  submittedAt: string;
}

/** The inbox drawer's save body. */
export interface InquiryUpdateValues {
  status: InquiryStatus;
  staffNote: string;
}

/**
 * Site feedback (sub-project 10) — about this website, not barangay business.
 *
 * Anonymous by design: nothing here identifies the sender, which is why there
 * is no consent field and no reply path. `/contact` remains the channel for
 * anything a resident needs an answer to.
 */
export type FeedbackCategory = "general" | "bug" | "feature" | "complaint" | "praise";

/**
 * Four states, all of which StatusChip already labels and tones. `answered`
 * would be a lie: nobody can answer a row with no address on it.
 */
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "dismissed";

/** The widget's body. The screenshot travels separately, in FormData. */
export interface PublicFeedbackValues {
  category: FeedbackCategory;
  subject: string;
  message: string;
  /** 0 means "not rated" — stored as null. */
  rating: number;
  /** The path the widget was opened on, e.g. "/transparency". Never a query string. */
  pagePath: string;
}

/** A queue row for the admin panel: flat and serializable. */
export interface FeedbackRow {
  id: string;
  category: FeedbackCategory;
  /** Display label, resolved against FEEDBACK_CATEGORIES. */
  categoryLabel: string;
  subject: string;
  message: string;
  rating: number | null;
  pagePath: string;
  /**
   * A signed URL valid for ten minutes, or null when no screenshot was
   * attached (or signing failed). The bucket is private, so there is no stable
   * public URL to store.
   */
  screenshotUrl: string | null;
  status: FeedbackStatus;
  staffNote: string;
  /** Resolved through `handled_by`; null once the account is gone. */
  handledByName: string | null;
  /** Manila calendar dates (YYYY-MM-DD). */
  handledAt: string | null;
  submittedAt: string;
}

/** The triage drawer's save body. */
export interface FeedbackUpdateValues {
  status: FeedbackStatus;
  staffNote: string;
}
