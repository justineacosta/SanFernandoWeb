import type { SessionUser } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { feedbackCategoryLabel } from "@/features/feedback/data";
import {
  NOTIFICATION_QUEUE_ORDER,
  NOTIFICATION_QUEUES,
  mergeRecent,
  permittedQueues,
  type NotificationCounts,
  type NotificationItem,
  type NotificationQueueKey,
  type NotificationSnapshot,
} from "@/lib/notifications";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

/** Per queue, for the bell's recent-items list. Kept small — this is a dropdown, not a table. */
const RECENT_PER_QUEUE = 5;
/** Across all queues, after merging. */
const RECENT_LIMIT = 8;

async function countQueue(admin: SupabaseAdmin, key: NotificationQueueKey): Promise<number> {
  const def = NOTIFICATION_QUEUES[key];
  // PostgREST `or` takes one comma-separated filter string. Both halves are
  // literals from this module's own registry — never user input.
  const filter = def.replyColumn
    ? `status.eq.${def.newStatus},${def.replyColumn}.not.is.null`
    : null;
  const query = admin.from(def.table).select("id", { count: "exact", head: true });
  const { count, error } = filter
    ? await query.or(filter)
    : await query.eq("status", def.newStatus);
  if (error) {
    console.error(`getNotificationSnapshot count failed (${key}):`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function recentApplications(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.applications;
  const { data, error } = await admin
    .from("applications")
    .select("id, ticket_no, first_name, last_name, purpose, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (applications):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "applications" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.purpose,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentComplaints(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.complaints;
  const { data, error } = await admin
    .from("complaints")
    .select("id, ticket_no, first_name, last_name, location, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (complaints):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "complaints" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.location,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentAppointments(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.appointments;
  const { data, error } = await admin
    .from("appointments")
    .select("id, ticket_no, first_name, last_name, purpose, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (appointments):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "appointments" as const,
    id: row.id,
    label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
    sublabel: row.purpose,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentAssistance(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.assistance;
  const { data, error } = await admin
    .from("assistance_requests")
    .select("id, ticket_no, first_name, last_name, created_at, assistance_categories (label)")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (assistance):", error.message);
    return [];
  }
  return data.map((row) => {
    const category = row.assistance_categories as unknown as { label: string } | null;
    return {
      queue: "assistance" as const,
      id: row.id,
      label: `${row.ticket_no} — ${row.first_name} ${row.last_name}`,
      sublabel: category?.label ?? "Assistance",
      createdAt: row.created_at,
      href: def.buildHref(row.id),
    };
  });
}

async function recentInquiries(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.inquiries;
  const { data, error } = await admin
    .from("inquiries")
    .select("id, first_name, last_name, subject, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (inquiries):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "inquiries" as const,
    id: row.id,
    label: `${row.first_name} ${row.last_name}`,
    sublabel: row.subject,
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

async function recentFeedback(admin: SupabaseAdmin): Promise<NotificationItem[]> {
  const def = NOTIFICATION_QUEUES.feedback;
  const { data, error } = await admin
    .from("feedback")
    .select("id, subject, category, created_at")
    .eq("status", def.newStatus)
    .order("created_at", { ascending: false })
    .limit(RECENT_PER_QUEUE);
  if (error || !data) {
    if (error) console.error("getNotificationSnapshot recent failed (feedback):", error.message);
    return [];
  }
  return data.map((row) => ({
    queue: "feedback" as const,
    id: row.id,
    label: row.subject,
    sublabel: feedbackCategoryLabel(row.category),
    createdAt: row.created_at,
    href: def.buildHref(row.id),
  }));
}

const RECENT_FETCHERS: Record<NotificationQueueKey, (admin: SupabaseAdmin) => Promise<NotificationItem[]>> = {
  applications: recentApplications,
  complaints: recentComplaints,
  appointments: recentAppointments,
  assistance: recentAssistance,
  inquiries: recentInquiries,
  feedback: recentFeedback,
};

/**
 * Counts, recent items and the viewer's last-seen stamp — everything the nav
 * badges and the bell need, scoped to what this viewer's permissions allow.
 * A count or a recent item for a queue the viewer cannot see would disclose
 * that the queue exists, the same leak `adminPageTitle` guards against for
 * page titles.
 *
 * Takes the already-resolved `user` rather than calling `getSessionUser()`
 * itself: both call sites (the portal layout, the polled route) have already
 * paid for that lookup, and `getSessionUser` is `cache()`d per request but
 * this function is also called from a route handler outside that request
 * scope.
 */
export async function getNotificationSnapshot(user: SessionUser): Promise<NotificationSnapshot> {
  const admin = createSupabaseAdminClient();
  const permitted = new Set(permittedQueues(user));

  const counts = {} as NotificationCounts;
  const recentLists = await Promise.all(
    NOTIFICATION_QUEUE_ORDER.map(async (key) => {
      if (!permitted.has(key)) {
        counts[key] = 0;
        return [] as NotificationItem[];
      }
      const [count, recent] = await Promise.all([countQueue(admin, key), RECENT_FETCHERS[key](admin)]);
      counts[key] = count;
      return recent;
    }),
  );

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("notifications_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("getNotificationSnapshot seen-at lookup failed:", profileError.message);
  }

  return {
    counts,
    recent: mergeRecent(recentLists, RECENT_LIMIT),
    seenAt: profile?.notifications_seen_at ?? null,
  };
}
