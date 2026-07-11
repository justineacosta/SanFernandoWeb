import type { LucideIcon } from "lucide-react";

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

/* ----------------------------------- Officials ---------------------------------- */

export type OfficialGroup = "executive" | "council" | "administration";

export interface Official {
  name: string;
  role: string;
  group: OfficialGroup;
  photo: string;
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

/* ------------------------------------- About ------------------------------------ */

export interface TimelineEntry {
  year: string;
  title: string;
  description: string;
  image: string;
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
