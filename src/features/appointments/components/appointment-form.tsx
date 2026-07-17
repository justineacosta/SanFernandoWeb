"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicAppointmentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { manilaToday } from "@/lib/format";
import { submitAppointment } from "@/features/appointments/actions";

const EMPTY: PublicAppointmentValues = {
  firstName: "",
  lastName: "",
  address: "",
  contactNumber: "",
  email: "",
  purpose: "",
  preferredDate: manilaToday(),
  preferredPeriod: "am",
  consent: false,
};

/** Public appointment request form; swaps to a ticket receipt on success. */
export function AppointmentForm() {
  const [values, setValues] = useState<PublicAppointmentValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one request. This ref closes that window.
  const submitting = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const set = <K extends keyof PublicAppointmentValues>(key: K, value: PublicAppointmentValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitAppointment(values);
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
          Appointment requested
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
          Barangay staff will confirm your schedule — the date and time you picked are a
          request, not a booking. Track this number to see the confirmed slot.
        </p>
        <div className="mb-6 mt-6 rounded-2xl border border-ink-200 bg-ink-50 p-6">
          <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Barangay staff check the schedule you asked for.</li>
            <li>They confirm it, or propose a different date and time.</li>
            <li>Track your ticket number anytime to see your confirmed schedule.</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/track?ticket=${encodeURIComponent(ticketNo)}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Track this request
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
          <Field label="First name" htmlFor="appointment-first-name">
            <Input
              id="appointment-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" htmlFor="appointment-last-name">
            <Input
              id="appointment-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Purok / street address" htmlFor="appointment-address">
          <Input
            id="appointment-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="appointment-contact">
            <Input
              id="appointment-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              autoComplete="tel"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="appointment-email">
            <Input
              id="appointment-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>
        <Field label="What is the appointment about?" htmlFor="appointment-purpose">
          <Textarea
            id="appointment-purpose"
            rows={4}
            placeholder="e.g. Consultation with the Punong Barangay"
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred date" htmlFor="appointment-preferred-date">
            <Input
              id="appointment-preferred-date"
              type="date"
              min={manilaToday()}
              value={values.preferredDate}
              onChange={(event) => set("preferredDate", event.target.value)}
            />
          </Field>
          <Field label="Preferred time" htmlFor="appointment-preferred-period">
            <Select
              id="appointment-preferred-period"
              value={values.preferredPeriod}
              onChange={(event) =>
                set("preferredPeriod", event.target.value as PublicAppointmentValues["preferredPeriod"])
              }
            >
              <option value="am">Morning (8:00 AM – 12:00 NN)</option>
              <option value="pm">Afternoon (1:00 PM – 5:00 PM)</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I agree to the barangay recording these details to arrange this appointment (Data
            Privacy Act of 2012).
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Filing…" : "Request appointment"}
        </Button>
      </Card>
    </form>
  );
}
