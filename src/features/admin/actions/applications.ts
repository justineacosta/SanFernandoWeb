"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApplicationReviewValues, WalkInApplicationValues } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const reviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    remarks: z.string().trim(),
  })
  // Spec §3: every negative decision must carry a reason the resident can read.
  .refine((value) => value.status !== "rejected" || value.remarks.length > 0, {
    error: "Remarks are required when rejecting an application.",
    path: ["remarks"],
  });

// Same field bounds as the public schema in `src/features/services/actions.ts` —
// a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's first name.")
    .max(80, "First name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's last name.")
    .max(80, "Last name is too long."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the applicant's purok or address.")
    .max(200, "Address is too long."),
  contactNumber: z
    .string()
    .trim()
    .min(7, "Enter a contact number.")
    .max(30, "Contact number is too long.")
    // Digits anywhere, not consecutively: "(077) 600-0000" is the local shape.
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a contact number."),
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.union([
      z.literal(""),
      z.string().email("Enter a valid email address.").max(254, "Email address is too long."),
    ]),
  ),
  purpose: z.string().trim().min(4, "Enter the purpose.").max(500, "Please keep the purpose short."),
  serviceId: z.string().trim().min(1, "Pick a document type."),
  consent: z.boolean().refine((value) => value === true, "Confirm the applicant gave consent."),
});

/** Approve or reject a pending application. */
export async function reviewApplication(
  id: string,
  values: ApplicationReviewValues,
): Promise<ActionResult> {
  const actor = await checkPermission("process-applications");
  if (!actor) return { error: NOT_FOUND };
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided ticket, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("applications")
    .update({
      status: parsed.data.status,
      remarks: parsed.data.remarks || null,
      reviewed_by: actor.id,
      reviewed_by_name: actor.fullName,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That application was already reviewed. Refresh to see its status." };

  const approved = parsed.data.status === "approved";
  await recordActivity(actor, {
    type: approved ? "approve" : "reject",
    action: approved ? "approved application" : "rejected application",
    entityType: "application",
    // Ticket rows carry a human-readable id, so it doubles as the label.
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/applications");
  return { error: null };
}

/** Mark an approved application as claimed at the hall. */
export async function releaseApplication(id: string): Promise<ActionResult> {
  const actor = await checkPermission("process-applications");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("applications")
    .update({
      status: "released",
      released_by: actor.id,
      released_by_name: actor.fullName,
      released_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not mark it released." };
  if (!data) return { error: "Only approved applications can be released. Refresh to see its status." };

  await recordActivity(actor, {
    type: "update",
    action: "released application",
    entityType: "application",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/applications");
  return { error: null };
}

/** Encode a walk-in applicant into the same queue (spec §3: one queue, online + office). */
export async function createWalkInApplication(
  values: WalkInApplicationValues,
): Promise<ActionResult> {
  const actor = await checkPermission("process-applications");
  if (!actor) return { error: NOT_FOUND };
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  const admin = createSupabaseAdminClient();
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, tone")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();
  if (serviceError) return { error: "Could not encode the application." };
  if (!service || service.tone !== "primary") return { error: "Pick a valid document type." };

  // Availability is NOT checked: a service toggled off online must still be
  // encodable at the counter — that is the point of the toggle.
  const { data, error } = await admin
    .from("applications")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInApplication failed:", error?.message);
    return { error: "Could not encode the application." };
  }

  await recordActivity(actor, {
    type: "create",
    action: "encoded walk-in application",
    entityType: "application",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/applications");
  return { error: null };
}
