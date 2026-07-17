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
 * Compare surnames the way a resident expects: case- and whitespace-insensitive,
 * and NFC-normalised. That last part is not academic here — "Peña" and "Nuñez"
 * are ordinary Ilocano surnames, and an ñ typed on one keyboard can arrive
 * decomposed (n + combining tilde) while the stored one is composed. The two are
 * the same name and must match; without normalising, the real owner is locked out.
 */
function sameSurname(a: string, b: string): boolean {
  const normalize = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("en-US");
  return normalize(a) === normalize(b);
}

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
  // Fetch by ticket number alone (it is unique), then match the last name here.
  // The name deliberately does NOT go into the query: `ilike` would read it as
  // a LIKE pattern, so a lone "%" — or "*", which PostgREST rewrites to "%" —
  // would match every surname and turn a guessed ticket number into a leak.
  // A plain comparison has no pattern semantics to get wrong.
  const { data, error } = await admin
    .from("applications")
    .select(
      "ticket_no, first_name, last_name, status, remarks, created_at, reviewed_at, released_at, services (title, requirements)",
    )
    .eq("ticket_no", ticket)
    .maybeSingle();

  if (error) {
    console.error("lookupTicket failed:", error.message);
    return { error: "Something went wrong. Please try again.", ticket: null };
  }
  // One message for "no such ticket" and "wrong name" alike — never confirm a
  // ticket exists to someone who cannot name its owner.
  if (!data || !sameSurname(data.last_name, surname)) {
    return { error: NOT_FOUND, ticket: null };
  }

  const service = data.services as unknown as { title: string; requirements: string[] } | null;

  return {
    error: null,
    ticket: {
      kind: "application",
      ticketNo: data.ticket_no,
      type: "Certificate Application",
      serviceTitle: service?.title ?? "Barangay document",
      requirements: service?.requirements ?? [],
      applicantName: `${data.first_name} ${data.last_name}`,
      status: data.status as TicketLookupResult["status"],
      submittedAt: toManilaDate(data.created_at),
      reviewedAt: data.reviewed_at ? toManilaDate(data.reviewed_at) : null,
      closedAt: data.released_at ? toManilaDate(data.released_at) : null,
      remarks: data.remarks,
      scheduleNote: null,
    },
  };
}
