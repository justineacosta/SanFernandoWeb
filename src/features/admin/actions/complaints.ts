"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ComplaintCloseValues, ComplaintReviewValues, WalkInComplaintValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { manilaToday } from "@/lib/format";

export interface ActionResult {
  error: string | null;
}

// Spec §3: every negative decision must carry a reason the resident can read.
const reviewSchema = z
  .object({
    status: z.enum(["under-review", "dismissed"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "dismissed" || value.remarks.length > 0, {
    error: "Remarks are required when dismissing a report.",
    path: ["remarks"],
  });

const closeSchema = z
  .object({
    status: z.enum(["resolved", "dismissed"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "dismissed" || value.remarks.length > 0, {
    error: "Remarks are required when dismissing a report.",
    path: ["remarks"],
  });

// Same field bounds as the public schema in `src/features/complaints/actions.ts`
// — a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the complainant's first name.")
    .max(80, "First name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the complainant's last name.")
    .max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the complainant's purok or address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number.")
    .max(30, "Contact number is too long.")
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a contact number."),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  respondent: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([z.literal(""), z.string().max(120, "That name is too long.")]),
  ),
  incidentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the incident.")
    .refine((value) => value <= manilaToday(), "The incident date cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the date of the incident."),
  location: z
    .string()
    .trim()
    .min(4, "Enter where it happened.")
    .max(200, "Please keep the location short."),
  narrative: z
    .string()
    .trim()
    .min(20, "Enter the incident narrative.")
    .max(4000, "Please keep the account under 4000 characters."),
  consent: z.boolean().refine((value) => value === true, "Confirm the complainant gave consent."),
});

/** Take a received report up for mediation, or dismiss it outright. */
export async function reviewComplaint(
  id: string,
  values: ComplaintReviewValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-complaints");
  if (!actor) return { error: NOT_FOUND };
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided report, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("complaints")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "received")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That report was already reviewed. Refresh to see its status." };

  const dismissed = parsed.data.status === "dismissed";
  await recordActivity(actor, {
    // "took up" moves the report into mediation — a status move, not a verdict.
    type: dismissed ? "reject" : "update",
    action: dismissed ? "dismissed complaint" : "took up complaint",
    entityType: "complaint",
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/complaints");
  return { error: null };
}

/** Close a report that is under review — settled, or dismissed after mediation. */
export async function closeComplaint(
  id: string,
  values: ComplaintCloseValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-complaints");
  if (!actor) return { error: NOT_FOUND };
  const parsed = closeSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      closed_by: actor.id,
      closed_by_name: actor.fullName,
      closed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "under-review")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not close the report." };
  if (!data) {
    return { error: "Only reports under review can be closed. Refresh to see its status." };
  }

  const resolved = parsed.data.status === "resolved";
  await recordActivity(actor, {
    // Resolved is the positive terminal outcome; it files with approve so a
    // reviewer filtering decisions sees all four flows' outcomes together.
    type: resolved ? "approve" : "reject",
    action: resolved ? "resolved complaint" : "dismissed complaint",
    entityType: "complaint",
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/complaints");
  return { error: null };
}

/** Encode a walk-in complainant into the same queue (spec §3: one queue, online + office). */
export async function createWalkInComplaint(values: WalkInComplaintValues): Promise<ActionResult> {
  const actor = await checkPermission("handle-complaints");
  if (!actor) return { error: NOT_FOUND };
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  // Availability is NOT checked: online intake toggled off must still be
  // encodable at the counter — that is the point of the toggle.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("complaints")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      respondent: parsed.data.respondent || null,
      incident_date: parsed.data.incidentDate,
      location: parsed.data.location,
      narrative: parsed.data.narrative,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInComplaint failed:", error?.message);
    return { error: "Could not encode the report." };
  }

  await recordActivity(actor, {
    type: "create",
    action: "encoded walk-in complaint",
    entityType: "complaint",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/complaints");
  return { error: null };
}
