import type { NavGate } from "@/lib/admin-nav";
import type { Permission } from "@/types";

/**
 * The six public-inbox queues that earn a notification badge, and the one
 * thing every consumer (nav badges, the bell, the server query) needs to
 * know about each: its table, its "untouched" status, the nav row it rolls
 * up under, the permission that gates it, and how to link to one record.
 *
 * Deliberately not merged into `src/features/admin/search-modules.ts`.
 * Neither registry contains the other: search covers eight modules that are
 * never notified (news, officials, transparency, ...) and omits `inquiries`
 * entirely, which must be notified. `tests/unit/notifications.test.ts`
 * checks the two agree on permission and href for the five keys they share,
 * so they cannot silently drift apart instead.
 */
export const NOTIFICATION_QUEUE_ORDER = [
  "applications",
  "complaints",
  "appointments",
  "assistance",
  "inquiries",
  "feedback",
] as const;

export type NotificationQueueKey = (typeof NOTIFICATION_QUEUE_ORDER)[number];

export interface NotificationQueueDef {
  table: string;
  /** The status value a fresh, untouched row carries. Not uniform across tables. */
  newStatus: string;
  /** The ADMIN_NAV_ITEMS href this queue rolls up under. Inquiries and feedback share one. */
  navHref: string;
  permission: Permission;
  /** Deep link to one record. Not uniform: feedback needs `?tab=feedback&review=`. */
  buildHref: (id: string) => string;
  /**
   * A timestamp column that also counts as unhandled when non-null. Set on the
   * four ticket queues only: a resident reply flips the ticket to
   * `under-review`, which is correctly NOT "untouched work", so without this
   * the badge would never fire for a reply.
   */
  replyColumn?: string;
}

export const NOTIFICATION_QUEUES: Record<NotificationQueueKey, NotificationQueueDef> = {
  applications: {
    table: "applications",
    newStatus: "pending",
    navHref: "/admin/applications",
    permission: "process-applications",
    buildHref: (id) => `/admin/applications?review=${id}`,
    replyColumn: "replied_at",
  },
  complaints: {
    table: "complaints",
    newStatus: "received",
    navHref: "/admin/complaints",
    permission: "handle-complaints",
    buildHref: (id) => `/admin/complaints?review=${id}`,
    replyColumn: "replied_at",
  },
  appointments: {
    table: "appointments",
    newStatus: "pending",
    navHref: "/admin/appointments",
    permission: "process-appointments",
    buildHref: (id) => `/admin/appointments?review=${id}`,
    replyColumn: "replied_at",
  },
  assistance: {
    table: "assistance_requests",
    newStatus: "pending",
    navHref: "/admin/assistance",
    permission: "handle-assistance",
    buildHref: (id) => `/admin/assistance?review=${id}`,
    replyColumn: "replied_at",
  },
  inquiries: {
    table: "inquiries",
    newStatus: "new",
    navHref: "/admin/inquiries",
    permission: "handle-inquiries",
    buildHref: (id) => `/admin/inquiries?review=${id}`,
  },
  feedback: {
    table: "feedback",
    newStatus: "new",
    navHref: "/admin/inquiries",
    permission: "handle-inquiries",
    buildHref: (id) => `/admin/inquiries?tab=feedback&review=${id}`,
  },
};

export type NotificationCounts = Record<NotificationQueueKey, number>;

export const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = {
  applications: 0,
  complaints: 0,
  appointments: 0,
  assistance: 0,
  inquiries: 0,
  feedback: 0,
};

export interface NotificationItem {
  queue: NotificationQueueKey;
  id: string;
  label: string;
  sublabel: string;
  /** ISO timestamp. Compared lexicographically — always UTC from Postgres, never reformatted. */
  createdAt: string;
  href: string;
}

export interface NotificationSnapshot {
  counts: NotificationCounts;
  recent: NotificationItem[];
  /** profiles.notifications_seen_at. Null means never opened. */
  seenAt: string | null;
}

/** Which queues a viewer's permissions unlock. SuperAdmins get all six. */
export function permittedQueues(gate: NavGate): NotificationQueueKey[] {
  return NOTIFICATION_QUEUE_ORDER.filter((key) => {
    if (gate.isSuperAdmin) return true;
    return gate.permissions.includes(NOTIFICATION_QUEUES[key].permission);
  });
}

/**
 * The number for one nav row. Sums every permitted queue that rolls up under
 * `href` — Inquiries & Feedback is two queues behind one row, everything
 * else is one queue behind one row.
 */
export function countForNavHref(
  counts: NotificationCounts,
  permitted: NotificationQueueKey[],
  href: string,
): number {
  const permittedSet = new Set(permitted);
  return NOTIFICATION_QUEUE_ORDER.filter(
    (key) => permittedSet.has(key) && NOTIFICATION_QUEUES[key].navHref === href,
  ).reduce((sum, key) => sum + counts[key], 0);
}

/** Total unhandled work across every permitted queue, for the bell's aria-label. */
export function totalUnhandled(counts: NotificationCounts, permitted: NotificationQueueKey[]): number {
  return permitted.reduce((sum, key) => sum + counts[key], 0);
}

/**
 * Whether the bell's dot should show. Null `seenAt` means "never looked" —
 * unseen iff there is anything outstanding at all. Otherwise unseen iff the
 * newest permitted item arrived after the last look.
 */
export function hasUnseen(recent: NotificationItem[], seenAt: string | null): boolean {
  if (recent.length === 0) return false;
  if (seenAt === null) return true;
  return recent.some((item) => item.createdAt > seenAt);
}

/** Newest-first across every queue's own recent list, capped at `limit`. */
export function mergeRecent(perQueue: NotificationItem[][], limit: number): NotificationItem[] {
  return perQueue
    .flat()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
}

/** Compact relative time for the bell dropdown, e.g. "15m ago". Deterministic via `now`. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
