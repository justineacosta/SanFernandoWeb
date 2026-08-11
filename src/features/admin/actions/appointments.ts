"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppointmentReviewValues, WalkInAppointmentValues } from "@/types";
import { AppointmentConfirmedEmail } from "@/emails/AppointmentConfirmedEmail";
import { AppointmentDeclinedEmail } from "@/emails/AppointmentDeclinedEmail";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";
import { NOT_FOUND, checkPermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  TICKET_INTAKE_STATUS,
  markTicketUpdateNotified,
  recordTicketUpdate,
} from "@/lib/ticket-updates";
import { manilaToday, manilaTodayNextYear } from "@/lib/format";

export interface ActionResult {
  error: string | null;
}

// Spec §3: every negative decision must carry a reason the resident can read.
// Confirming additionally requires a concrete slot: staff may confirm the
// requested date or propose a different one, but never a blank one.
const reviewSchema = z
  .object({
    status: z.enum(["confirmed", "declined"]),
    confirmedDate: z.union([
      z.literal(""),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the confirmed date."),
    ]),
    confirmedPeriod: z.union([z.literal(""), z.enum(["am", "pm"])]),
    remarks: z.string().trim().max(1000, "Please keep the remarks short."),
  })
  .refine((value) => value.status !== "declined" || value.remarks.length > 0, {
    error: "Remarks are required when declining an appointment.",
    path: ["remarks"],
  })
  .refine((value) => value.status !== "confirmed" || value.confirmedDate !== "", {
    error: "Pick the date you are confirming.",
    path: ["confirmedDate"],
  })
  .refine((value) => value.status !== "confirmed" || value.confirmedPeriod !== "", {
    error: "Pick morning or afternoon.",
    path: ["confirmedPeriod"],
  });

// Same field bounds as the public schema in `src/features/appointments/actions.ts`
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
  purpose: z
    .string()
    .trim()
    .min(4, "Tell us what the appointment is about.")
    .max(500, "Please keep the purpose short."),
  preferredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date for your appointment.")
    .refine((value) => value >= manilaToday(), "Pick a date that has not passed.")
    // A year out is already generous for a barangay hall visit; beyond that is
    // almost certainly a typo or a script.
    .refine((value) => value <= manilaTodayNextYear(), "Please pick a date within the next year."),
  preferredPeriod: z.enum(["am", "pm"], { error: "Pick morning or afternoon." }),
  consent: z.boolean().refine((value) => value === true, "Confirm the resident gave consent."),
});

/** Confirm the requested slot, propose a different one, or decline. */
export async function reviewAppointment(
  id: string,
  values: AppointmentReviewValues,
): Promise<ActionResult> {
  const actor = await checkPermission("process-appointments");
  if (!actor) return { error: NOT_FOUND };
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const admin = createSupabaseAdminClient();
  // Guard the transition in the WHERE clause: a stale tab must not re-review a
  // decided appointment, and two staff clicking at once must not both win.
  const { data, error } = await admin
    .from("appointments")
    .update({
      status: parsed.data.status,
      // Declining leaves the slot columns null: there is no confirmed schedule.
      confirmed_date: parsed.data.status === "confirmed" ? parsed.data.confirmedDate : null,
      confirmed_period: parsed.data.status === "confirmed" ? parsed.data.confirmedPeriod : null,
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
  if (!data) return { error: "That appointment was already reviewed. Refresh to see its status." };

  const confirmed = parsed.data.status === "confirmed";
  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "appointment",
    entryType: "status",
    status: parsed.data.status,
    body: parsed.data.remarks || "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  if (data.email) {
    await sendEmail({
      to: data.email,
      subject: confirmed
        ? `Your appointment is confirmed — ${data.ticket_no}`
        : `Update on your appointment request — ${data.ticket_no}`,
      template: confirmed
        ? AppointmentConfirmedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            confirmedDate: parsed.data.confirmedDate,
            confirmedPeriod: parsed.data.confirmedPeriod as "am" | "pm",
          })
        : AppointmentDeclinedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks,
          }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }
  await recordActivity(actor, {
    type: confirmed ? "approve" : "reject",
    action: confirmed ? "confirmed appointment" : "declined appointment",
    entityType: "appointment",
    entityId: data.ticket_no,
    entityLabel: data.ticket_no,
    detail: parsed.data.remarks || undefined,
  });
  revalidatePath("/admin/appointments");
  return { error: null };
}

/** Mark a confirmed appointment as completed after the resident's visit. */
export async function completeAppointment(id: string): Promise<ActionResult> {
  const actor = await checkPermission("process-appointments");
  if (!actor) return { error: NOT_FOUND };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .update({
      status: "completed",
      completed_by: actor.id,
      completed_by_name: actor.fullName,
      completed_at: new Date().toISOString(),
      replied_at: null,
    })
    .eq("id", id)
    .eq("status", "confirmed")
    .select("ticket_no")
    .maybeSingle();
  if (error) return { error: "Could not mark it completed." };
  if (!data) {
    return { error: "Only confirmed appointments can be completed. Refresh to see its status." };
  }

  await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "appointment",
    entryType: "status",
    status: "completed",
    body: "",
    visibility: "public",
    authorKind: "system",
    authorName: actor.fullName,
  });
  await recordActivity(actor, {
    type: "update",
    action: "completed appointment",
    entityType: "appointment",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/appointments");
  return { error: null };
}

/** Encode a walk-in appointment into the same queue (spec §3: one queue, online + office). */
export async function createWalkInAppointment(
  values: WalkInAppointmentValues,
): Promise<ActionResult> {
  const actor = await checkPermission("process-appointments");
  if (!actor) return { error: NOT_FOUND };
  const parsed = walkInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values." };
  }

  // Availability is NOT checked: online intake toggled off must still be
  // encodable at the counter — that is the point of the toggle.
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      address: parsed.data.address,
      contact_number: parsed.data.contactNumber,
      email: parsed.data.email || null,
      purpose: parsed.data.purpose,
      preferred_date: parsed.data.preferredDate,
      preferred_period: parsed.data.preferredPeriod,
      source: "walk-in",
    })
    .select("ticket_no")
    .single();
  if (error || !data) {
    console.error("createWalkInAppointment failed:", error?.message);
    return { error: "Could not encode the appointment." };
  }

  const entryId = await recordTicketUpdate({
    ticketNo: data.ticket_no,
    kind: "appointment",
    entryType: "status",
    status: TICKET_INTAKE_STATUS.appointment,
    visibility: "public",
    authorKind: "staff",
    authorName: actor.fullName,
  });
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Appointment request received — ${data.ticket_no}`,
      template: AppointmentSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        purpose: parsed.data.purpose,
        preferredDate: parsed.data.preferredDate,
        preferredPeriod: parsed.data.preferredPeriod,
      }),
    });
    if (entryId) await markTicketUpdateNotified(entryId);
  }

  await recordActivity(actor, {
    type: "create",
    action: "encoded walk-in appointment",
    entityType: "appointment",
    entityId: data.ticket_no,
  });
  revalidatePath("/admin/appointments");
  return { error: null };
}
