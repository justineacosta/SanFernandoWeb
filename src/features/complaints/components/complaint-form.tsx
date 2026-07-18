"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicComplaintValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { manilaToday } from "@/lib/format";
import { submitComplaint } from "@/features/complaints/actions";

const EMPTY: PublicComplaintValues = {
  firstName: "",
  lastName: "",
  address: "",
  contactNumber: "",
  email: "",
  respondent: "",
  incidentDate: "",
  location: "",
  narrative: "",
  consent: false,
};

/** Public incident report form; swaps to a ticket receipt on success. */
export function ComplaintForm() {
  const [values, setValues] = useState<PublicComplaintValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one report. This ref closes that window.
  const submitting = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = <K extends keyof PublicComplaintValues>(key: K, value: PublicComplaintValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitComplaint(values);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setTicketNo(result.ticketNo);
      } finally {
        submitting.current = false;
      }
    });
  }

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function copyTicket() {
    if (!ticketNo) return;
    try {
      await navigator.clipboard.writeText(ticketNo);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the number is on screen to copy by hand.
    }
  }

  if (ticketNo) {
    return (
      <Card className="rounded-3xl p-8">
        <CheckCircle2 className="mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">
          Report filed
        </h2>
        <p className="mb-6 text-ink-600">
          Keep this ticket number. You will need it — with your last name — to check your
          status at any time.
        </p>
        <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-100/50 p-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Your ticket number
          </p>
          <p className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900">
            {ticketNo}
          </p>
          <button
            type="button"
            onClick={copyTicket}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            <span aria-live="polite">{copied ? "Copied" : "Copy number"}</span>
          </button>
        </div>
        <p className="mt-4 text-sm text-ink-600">
          Keep this number safe. Tracking a report shows its status only — never the
          details you wrote here.
        </p>
        <div className="mb-6 mt-6 rounded-2xl border border-ink-200 bg-ink-50 p-6">
          <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Barangay staff log and review your report.</li>
            <li>The Lupong Tagapamayapa may contact you to arrange mediation.</li>
            <li>Track your ticket number anytime to see its status.</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/track?ticket=${encodeURIComponent(ticketNo)}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Track this report
          </Link>
          <Link href="/services" className="text-sm font-semibold text-ink-600 hover:underline">
            Back to services
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <Card className="space-y-5 rounded-3xl p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="complaint-first-name">
            <Input
              id="complaint-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" htmlFor="complaint-last-name">
            <Input
              id="complaint-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Purok / street address" htmlFor="complaint-address">
          <Input
            id="complaint-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="complaint-contact">
            <Input
              id="complaint-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              autoComplete="tel"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="complaint-email">
            <Input
              id="complaint-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>
        <Field label="Person complained about (optional)" htmlFor="complaint-respondent">
          <Input
            id="complaint-respondent"
            placeholder="Leave blank if you would rather not say"
            value={values.respondent}
            onChange={(event) => set("respondent", event.target.value)}
          />
        </Field>
        <Field label="Date of incident" htmlFor="complaint-incident-date">
          <Input
            id="complaint-incident-date"
            type="date"
            max={manilaToday()}
            value={values.incidentDate}
            onChange={(event) => set("incidentDate", event.target.value)}
          />
        </Field>
        <Field label="Where it happened" htmlFor="complaint-location">
          <Input
            id="complaint-location"
            placeholder="e.g. Purok 2 basketball court"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
          />
        </Field>
        <Field label="What happened" htmlFor="complaint-narrative">
          <Textarea
            id="complaint-narrative"
            rows={6}
            placeholder="Describe the incident in your own words."
            value={values.narrative}
            onChange={(event) => set("narrative", event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I agree to the barangay recording these details to act on this report (Data
            Privacy Act of 2012).
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Filing…" : "Submit report"}
        </Button>
      </Card>
    </form>
  );
}
