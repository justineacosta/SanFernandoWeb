"use server";

import type { TicketLookupResult } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";

export interface LookupResult {
  error: string | null;
  ticket: TicketLookupResult | null;
}

/** Ticket numbers are sequential and guessable; the last name is the privacy gate. */
const LOOKUP_LIMIT = 10;
const LOOKUP_WINDOW_MS = 10 * 60 * 1000;

/** One message for "wrong number" and "wrong name" alike — never confirm a ticket exists. */
const NOT_FOUND = "We could not find that ticket. Check the number and the last name you used.";

/**
 * Public ticket lookup. Requires the ticket number AND a matching last name
 * (spec §3) — the number alone is guessable. Rate-limited against enumeration.
 * Plan 2C: query the tickets_view union here instead and widen `type`.
 */
export async function lookupTicket(ticketNo: string, lastName: string): Promise<LookupResult> {
  const ip = await requestIp();
  if (!checkRateLimit(`track:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_MS)) {
    return { error: "Too many lookups. Please wait a few minutes and try again.", ticket: null };
  }

  const ticket = ticketNo.trim().toUpperCase();
  const surname = lastName.trim();
  if (!ticket || !surname) {
    return { error: "Enter both your ticket number and last name.", ticket: null };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("applications")
    .select(
      "ticket_no, first_name, last_name, status, purpose, remarks, created_at, reviewed_at, released_at, services (title, requirements)",
    )
    .eq("ticket_no", ticket)
    .ilike("last_name", surname)
    .maybeSingle();

  if (error) {
    console.error("lookupTicket failed:", error.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  if (!data) return { error: NOT_FOUND, ticket: null };

  const service = data.services as unknown as { title: string; requirements: string[] } | null;

  return {
    error: null,
    ticket: {
      ticketNo: data.ticket_no,
      type: "Certificate Application",
      serviceTitle: service?.title ?? "Barangay document",
      requirements: service?.requirements ?? [],
      applicantName: `${data.first_name} ${data.last_name}`,
      status: data.status as TicketLookupResult["status"],
      submittedAt: toManilaDate(data.created_at),
      reviewedAt: data.reviewed_at ? toManilaDate(data.reviewed_at) : null,
      releasedAt: data.released_at ? toManilaDate(data.released_at) : null,
      remarks: data.remarks,
    },
  };
}
