"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApplicationReviewValues, WalkInApplicationValues, WalkInTicketResult } from "@/types";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { manilaToday } from "@/lib/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { markTicketUpdateNotified, recordTicketUpdate } from "@/lib/ticket-updates";
import { recordIntakeWithAttachments, validateTicketFiles } from "@/lib/ticket-attachments";
import { sendEmail } from "@/lib/email";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";
import { ApplicationApprovedEmail } from "@/emails/ApplicationApprovedEmail";
import { ApplicationRejectedEmail } from "@/emails/ApplicationRejectedEmail";

export interface ActionResult {
  error: string | null;
}

const reviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]),
    // Always optional as of 2026-08-05. This previously carried a .refine
    // requiring remarks on a rejection ("every negative decision must carry a
    // reason the resident can read"); that rule was deliberately reversed. The
    // consequence is accepted and not papered over: TicketNotice already skips
    // a falsy `remarks`, so a rejection email can arrive with no Reason block,
    // and the ticket_updates entry gets an empty body on /track. No fallback
    // copy is invented — inventing a reason the reviewer did not give would be
    // worse than showing none. See §2b of
    // docs/superpowers/specs/2026-08-05-ticket-resident-name-parts-design.md.
    remarks: z.string().trim(),
  });

// Same field bounds as the public schema in `src/features/services/actions.ts` —
// a walk-in row and an online row must be constrained identically.
const walkInSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's first name.")
    .max(80, "First name is too long."),
  middleName: z.string().trim().max(80, "Middle name is too long."),
  lastName: z
    .string()
    .trim()
    .min(2, "Enter the applicant's last name.")
    .max(80, "Last name is too long."),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the applicant's date of birth.")
    .refine((value) => value <= manilaToday(), "The date of birth cannot be in the future.")
    .refine((value) => value >= "1900-01-01", "Enter the applicant's date of birth."),
  address: z
    .string()
    .trim()
    .min(4, "Enter the applicant's sitio or address.")
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
  // Optional since 0033, matching the public schema. Cap kept, floor dropped.
  purpose: z.string().trim().max(500, "Please keep the purpose short."),
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
      replied_at: null,
    })
    .eq("id", id)
    .in("status", ["pending", "under-review", "awaiting-info"])
    .select("ticket_no, email, first_name, services (title, requirements)")
    .maybeSingle();
  if (error) return { error: "Could not save the review." };
  if (!data) return { error: "That application was already reviewed. Refresh to see its status." };

  const approved = parsed.data.status === "approved";
  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "application",
    entryType: "status",
    status: parsed.data.status,
    body: parsed.data.remarks || "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  if (data.email) {
    const service = data.services as unknown as { title: string; requirements: string[] } | null;
    const serviceTitle = service?.title ?? "document";
    await sendEmail({
      to: data.email,
      subject: approved
        ? `Your application is ready to claim — ${data.ticket_no}`
        : `Update on your application — ${data.ticket_no}`,
      template: approved
        ? ApplicationApprovedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            serviceTitle,
            requirements: service?.requirements ?? [],
          })
        : ApplicationRejectedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            serviceTitle,
            remarks: parsed.data.remarks,
          }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }
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
      replied_at: null,
    })
    .eq("id", id)
    .eq("status", "approved")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not mark it released." };
  if (!data) return { error: "Only approved applications can be released. Refresh to see its status." };

  await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "application",
    entryType: "status",
    status: "released",
    body: "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
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
  files: File[],
): Promise<WalkInTicketResult> {
  const actor = await checkPermission("process-applications");
  if (!actor) return { error: NOT_FOUND, attachmentWarning: null };
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values.", attachmentWarning: null };
  }

  const admin = createSupabaseAdminClient();
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, flow, title")
    .eq("id", parsed.data.serviceId)
    .maybeSingle();
  if (serviceError) return { error: "Could not encode the application.", attachmentWarning: null };
  // Gated on `flow`, not `tone` — the assistance/appointment rows are tone
  // 'primary' too and would otherwise clear this check, letting the drawer
  // encode a walk-in "application" against a service with no application form.
  if (!service || service.flow !== "apply") {
    return { error: "Pick a valid document type.", attachmentWarning: null };
  }

  // Staff-fixable rejections happen before any row exists, exactly as on the
  // public path — a bad scan must not cost the resident at the counter a
  // ticket number.
  const fileError = await validateTicketFiles(files);
  if (fileError) return { error: fileError, attachmentWarning: null };

  // Availability is NOT checked: a service toggled off online must still be
  // encodable at the counter — that is the point of the toggle.
  const { data, error } = await admin
    .from("applications")
    .insert({
      first_name: parsed.data.firstName,
      // Optional fields store null, never "" — the same convention `email` set.
      middle_name: parsed.data.middleName || null,
      last_name: parsed.data.lastName,
      birth_date: parsed.data.birthDate,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      service_id: service.id,
      purpose: parsed.data.purpose || null,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInApplication failed:", error?.message);
    return { error: "Could not encode the application.", attachmentWarning: null };
  }

  const { entryId, attachmentWarning } = await recordIntakeWithAttachments({
    ticketNo: data.ticket_no,
    kind: "application",
    files,
    authorKind: "staff",
    authorName: actor.fullName,
    context: "createWalkInApplication",
  });
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Application received — ${data.ticket_no}`,
      template: ApplicationSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        serviceTitle: service.title,
        purpose: parsed.data.purpose || null,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }
  await recordActivity(actor, {
    type: "create",
    action: "encoded walk-in application",
    entityType: "application",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/applications");
  return { error: null, attachmentWarning };
}
