"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { TicketLookupResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { lookupTicket } from "@/features/track/actions";
import { TicketTimeline } from "./ticket-timeline";

/** Ticket-number + last-name lookup, then the status timeline. */
export function TrackLookup({ initialTicket = "" }: { initialTicket?: string }) {
  const [ticketNo, setTicketNo] = useState(initialTicket);
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketLookupResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await lookupTicket(ticketNo, lastName);
      setTicket(result.ticket);
      setError(result.error);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Card className="rounded-3xl p-8">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Field label="Ticket number" htmlFor="track-ticket">
            <Input
              id="track-ticket"
              placeholder="APP-2026-00001"
              value={ticketNo}
              onChange={(event) => setTicketNo(event.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="track-last-name">
            <Input
              id="track-last-name"
              placeholder="As written on your application"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Checking…" : "Check status"}
          </Button>
        </form>
      </Card>

      {ticket ? (
        <Card className="rounded-3xl p-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            {ticket.type}
          </p>
          <h2 className="mb-1 font-display text-2xl font-bold text-ink-900">{ticket.ticketNo}</h2>
          <p className="mb-8 text-ink-600">
            {ticket.serviceTitle} · {ticket.applicantName}
          </p>
          <TicketTimeline ticket={ticket} />
          {ticket.status === "approved" && ticket.requirements.length > 0 ? (
            <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-100/50 p-6">
              <p className="mb-3 text-sm font-semibold text-ink-900">Bring these when you claim</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-600">
                {ticket.requirements.map((requirement, index) => (
                  <li key={`${index}-${requirement}`}>{requirement}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
