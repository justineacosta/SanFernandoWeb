"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type {
  AssistanceDecisionValues,
  AssistanceReviewValues,
  WalkInAssistanceValues,
} from "@/types";
import { AssistanceDeclinedEmail } from "@/emails/AssistanceDeclinedEmail";
import { AssistanceGrantedEmail } from "@/emails/AssistanceGrantedEmail";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  TICKET_INTAKE_STATUS,
  markTicketUpdateNotified,
  recordTicketUpdate,
} from "@/lib/ticket-updates";

export interface ActionResult {
  error: string | null;
}

// Spec §3: every negative decision must carry a reason the resident can read.
const reviewSchema = z
  .object({
    status: z.enum(["under-review", "declined"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "declined" || value.remarks.length > 0, {
    error: "Remarks are required when declining a request.",
    path: ["remarks"],
  });

const decisionSchema = z
  .object({
    status: z.enum(["granted", "declined"]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "declined" || value.remarks.length > 0, {
    error: "Remarks are required when declining a request.",
    path: ["remarks"],
  });

// Same field bounds as the public schema in `src/features/assistance/actions.ts`
// — a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the resident's first name.")
    .max(80, "First name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the resident's last name.")
    .max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the resident's sitio or address.")
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
  categoryId: z.string().trim().min(1, "Pick the kind of assistance you need."),
  details: z
    .string()
    .trim()
    .min(20, "Please tell us a little more about what you need.")
    .max(2000, "Please keep the details under 2000 characters."),
  consent: z.boolean().refine((value) => value === true, "Confirm the resident gave consent."),
});

/** Take a received request up for processing, or decline it outright. */
export async function reviewAssistance(
  id: string,
  values: AssistanceReviewValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-assistance");
  if (!actor) return { error: NOT_FOUND };
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided request, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("assistance_requests")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
      replied_at: null,
    })
    .eq("id", id)
    .in("status", ["pending", "under-review", "awaiting-info"])
    .select("ticket_no, email, first_name")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That request was already reviewed. Refresh to see its status." };

  const declined = parsed.data.status === "declined";
  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "assistance",
    entryType: "status",
    status: parsed.data.status,
    body: parsed.data.remarks || "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  if (data.email && declined) {
    await sendEmail({
      to: data.email,
      subject: `Update on your assistance request — ${data.ticket_no}`,
      template: AssistanceDeclinedEmail({
        firstName: data.first_name,
        ticketNo: data.ticket_no,
        remarks: parsed.data.remarks,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }
  await recordActivity(actor, {
    // "took up" is a mid-flow status move, not a decision — hence update.
    type: declined ? "reject" : "update",
    action: declined ? "declined assistance request" : "took up assistance request",
    entityType: "assistance",
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/assistance");
  return { error: null };
}

/** Decide a request that is under review — grant it, or decline it. */
export async function decideAssistance(
  id: string,
  values: AssistanceDecisionValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-assistance");
  if (!actor) return { error: NOT_FOUND };
  const parsed = decisionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid decision." };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("assistance_requests")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      decided_by: actor.id,
      decided_by_name: actor.fullName,
      decided_at: new Date().toISOString(),
      replied_at: null,
    })
    .eq("id", id)
    .in("status", ["under-review", "awaiting-info"])
    .select("ticket_no, email, first_name, assistance_categories (label)")
    .maybeSingle();
  if (error) return { error: "Could not save the decision." };
  if (!data) {
    return { error: "Only open requests can be decided. Refresh to see its status." };
  }

  const granted = parsed.data.status === "granted";
  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "assistance",
    entryType: "status",
    status: parsed.data.status,
    body: parsed.data.remarks || "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  if (data.email) {
    const category = data.assistance_categories as unknown as { label: string } | null;
    await sendEmail({
      to: data.email,
      subject: granted
        ? `Your assistance request was granted — ${data.ticket_no}`
        : `Update on your assistance request — ${data.ticket_no}`,
      template: granted
        ? AssistanceGrantedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            categoryLabel: category?.label ?? "assistance",
            remarks: parsed.data.remarks || null,
          })
        : AssistanceDeclinedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks,
          }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }
  await recordActivity(actor, {
    type: granted ? "approve" : "reject",
    action: granted ? "granted assistance request" : "declined assistance request",
    entityType: "assistance",
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/assistance");
  return { error: null };
}

/** Encode a walk-in requester into the same queue (spec §3: one queue, online + office). */
export async function createWalkInAssistance(
  values: WalkInAssistanceValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-assistance");
  if (!actor) return { error: NOT_FOUND };
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();

  // Never trust the client's categoryId: it must exist and still be active. A
  // retired category is withdrawn for good, so unlike a service's temporary
  // availability toggle, nothing may write one, online or at the counter.
  const { data: category, error: categoryError } = await admin
    .from("assistance_categories")
    .select("id, is_active, label")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (categoryError) {
    console.error("createWalkInAssistance category lookup failed:", categoryError.message);
    return { error: "Something went wrong. Please try again." };
  }
  if (!category?.is_active) {
    return { error: "Pick the kind of assistance you need." };
  }

  // Availability is NOT checked beyond the category: online intake toggled off
  // must still be encodable at the counter — that is the point of the toggle.
  const { data, error } = await admin
    .from("assistance_requests")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      category_id: category.id,
      details: parsed.data.details,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInAssistance failed:", error?.message);
    return { error: "Could not encode the request." };
  }

  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "assistance",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.assistance,
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Assistance request received — ${data.ticket_no}`,
      template: AssistanceSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        categoryLabel: category.label,
        details: parsed.data.details,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }

  await recordActivity(actor, {
    type: "create",
    action: "encoded walk-in assistance request",
    entityType: "assistance",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/assistance");
  return { error: null };
}
