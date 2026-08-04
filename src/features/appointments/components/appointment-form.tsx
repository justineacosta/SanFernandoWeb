"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicAppointmentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { manilaToday } from "@/lib/format";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { submitAppointment } from "@/features/appointments/actions";
import { appointmentSchema } from "@/features/appointments/schema";
import { SwapReveal } from "@/components/ui/swap-reveal";

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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one request. This ref closes that window.
  const submitting = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const set = <K extends keyof PublicAppointmentValues>(key: K, value: PublicAppointmentValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const v = useFieldValidation(appointmentSchema, values);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!v.revealAll(event.currentTarget as HTMLFormElement)) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitAppointment(values, turnstileToken);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setTicketNo(result.ticketNo);
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        submitting.current = false;
        turnstileRef.current?.reset();
        setTurnstileToken(null);
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
      <SwapReveal face="receipt">
        <Card className="rounded-3xl p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
          <Eyebrow className="mb-3 justify-center">Request received</Eyebrow>
          <h2 className="mb-2 font-display text-3xl font-bold tracking-tight text-ink-900">
            Appointment <BrandStroke>requested</BrandStroke>
          </h2>
          <p className="mx-auto mb-6 max-w-md text-ink-600">
            Keep this ticket number. You will need it — with your last name — to check your
            status at any time.
          </p>
          <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Your ticket number
            </p>
            <p className="mt-2 font-display text-4xl font-bold tabular-nums tracking-tight text-brand-600">
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
          <div className="mb-6 mt-6 rounded-2xl border border-ink-200 bg-ink-50 p-6 text-left">
            <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
              <li>Barangay staff check the schedule you asked for.</li>
              <li>They confirm it, or propose a different date and time.</li>
              <li>Track your ticket number anytime to see your confirmed schedule.</li>
            </ol>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
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
      </SwapReveal>
    );
  }

  return (
    <SwapReveal face="form">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        <Card className="space-y-5 rounded-3xl p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="First name"
              htmlFor="appointment-first-name"
              error={v.errorFor("firstName")}
            >
              <Input
                id="appointment-first-name"
                name="firstName"
                value={values.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                autoComplete="given-name"
                {...v.fieldProps("firstName", "appointment-first-name")}
              />
            </Field>
            <Field label="Last name" htmlFor="appointment-last-name" error={v.errorFor("lastName")}>
              <Input
                id="appointment-last-name"
                name="lastName"
                value={values.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                autoComplete="family-name"
                {...v.fieldProps("lastName", "appointment-last-name")}
              />
            </Field>
          </div>
          <Field
            label="Sitio / street address"
            htmlFor="appointment-address"
            error={v.errorFor("address")}
          >
            <Input
              id="appointment-address"
              name="address"
              placeholder="Sitio 1, Barangay San Fernando"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              autoComplete="street-address"
              {...v.fieldProps("address", "appointment-address")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Contact number"
              htmlFor="appointment-contact"
              error={v.errorFor("contactNumber")}
            >
              <Input
                id="appointment-contact"
                name="contactNumber"
                type="tel"
                placeholder="(077) 600-0000"
                value={values.contactNumber}
                onChange={(event) => set("contactNumber", event.target.value)}
                autoComplete="tel"
                {...v.fieldProps("contactNumber", "appointment-contact")}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="appointment-email" error={v.errorFor("email")}>
              <Input
                id="appointment-email"
                name="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
                autoComplete="email"
                {...v.fieldProps("email", "appointment-email")}
              />
            </Field>
          </div>
          <Field
            label="What is the appointment about?"
            htmlFor="appointment-purpose"
            error={v.errorFor("purpose")}
          >
            <Textarea
              id="appointment-purpose"
              name="purpose"
              rows={4}
              placeholder="e.g. Consultation with the Punong Barangay"
              value={values.purpose}
              onChange={(event) => set("purpose", event.target.value)}
              {...v.fieldProps("purpose", "appointment-purpose")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Preferred date"
              htmlFor="appointment-preferred-date"
              error={v.errorFor("preferredDate")}
            >
              <Input
                id="appointment-preferred-date"
                name="preferredDate"
                type="date"
                min={manilaToday()}
                value={values.preferredDate}
                onChange={(event) => set("preferredDate", event.target.value)}
                {...v.fieldProps("preferredDate", "appointment-preferred-date")}
              />
            </Field>
            <Field
              label="Preferred time"
              htmlFor="appointment-preferred-period"
              error={v.errorFor("preferredPeriod")}
            >
              <Select
                id="appointment-preferred-period"
                name="preferredPeriod"
                value={values.preferredPeriod}
                onChange={(event) =>
                  set("preferredPeriod", event.target.value as PublicAppointmentValues["preferredPeriod"])
                }
                {...v.fieldProps("preferredPeriod", "appointment-preferred-period")}
              >
                <option value="am">Morning (8:00 AM – 12:00 NN)</option>
                <option value="pm">Afternoon (1:00 PM – 5:00 PM)</option>
              </Select>
            </Field>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-ink-600">
              <Checkbox
                name="consent"
                checked={values.consent}
                onChange={(event) => set("consent", event.target.checked)}
                onBlur={() => v.markTouched("consent")}
                aria-invalid={v.errorFor("consent") ? true : undefined}
                aria-describedby={v.errorFor("consent") ? "appointment-consent-error" : undefined}
                className="mt-0.5 shrink-0"
              />
              <span>
                I agree to the barangay recording these details to arrange this appointment (Data
                Privacy Act of 2012).
              </span>
            </label>
            {v.errorFor("consent") ? (
              <p
                id="appointment-consent-error"
                role="alert"
                className="text-sm font-medium text-danger"
              >
                {v.errorFor("consent")}
              </p>
            ) : null}
          </div>
          {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
          <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
          <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
            {isPending ? "Filing…" : "Request appointment"}
          </Button>
        </Card>
      </form>
    </SwapReveal>
  );
}
