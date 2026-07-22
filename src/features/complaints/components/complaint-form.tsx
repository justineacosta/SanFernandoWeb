"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicComplaintValues } from "@/types";
import { Button } from "@/components/ui/button";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { manilaToday } from "@/lib/format";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { submitComplaint } from "@/features/complaints/actions";
import { complaintSchema } from "@/features/complaints/schema";
import { SwapReveal } from "@/components/ui/swap-reveal";

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

  const v = useFieldValidation(complaintSchema, values);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    // Reveal every message and focus the first field that needs work, rather
    // than spending a round trip to be told the same thing.
    if (!v.revealAll(event.currentTarget as HTMLFormElement)) return;
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
      <SwapReveal face="receipt">
        <Card className="rounded-3xl p-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
          <Eyebrow className="mb-3 justify-center">Request received</Eyebrow>
          <h2 className="mb-2 font-display text-3xl font-bold tracking-tight text-ink-900">
            Report <BrandStroke>filed</BrandStroke>
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
            Keep this number safe. Tracking a report shows its status only — never the
            details you wrote here.
          </p>
          <div className="mb-6 mt-6 rounded-2xl border border-ink-200 bg-ink-50 p-6 text-left">
            <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
              <li>Barangay staff log and review your report.</li>
              <li>The Lupong Tagapamayapa may contact you to arrange mediation.</li>
              <li>Track your ticket number anytime to see its status.</li>
            </ol>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
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
              htmlFor="complaint-first-name"
              error={v.errorFor("firstName")}
            >
              <Input
                id="complaint-first-name"
                name="firstName"
                value={values.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                autoComplete="given-name"
                {...v.fieldProps("firstName", "complaint-first-name")}
              />
            </Field>
            <Field label="Last name" htmlFor="complaint-last-name" error={v.errorFor("lastName")}>
              <Input
                id="complaint-last-name"
                name="lastName"
                value={values.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                autoComplete="family-name"
                {...v.fieldProps("lastName", "complaint-last-name")}
              />
            </Field>
          </div>
          <Field
            label="Purok / street address"
            htmlFor="complaint-address"
            error={v.errorFor("address")}
          >
            <Input
              id="complaint-address"
              name="address"
              placeholder="Purok 1, Barangay San Fernando"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              autoComplete="street-address"
              {...v.fieldProps("address", "complaint-address")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Contact number"
              htmlFor="complaint-contact"
              error={v.errorFor("contactNumber")}
            >
              <Input
                id="complaint-contact"
                name="contactNumber"
                type="tel"
                placeholder="(077) 600-0000"
                value={values.contactNumber}
                onChange={(event) => set("contactNumber", event.target.value)}
                autoComplete="tel"
                {...v.fieldProps("contactNumber", "complaint-contact")}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="complaint-email" error={v.errorFor("email")}>
              <Input
                id="complaint-email"
                name="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
                autoComplete="email"
                {...v.fieldProps("email", "complaint-email")}
              />
            </Field>
          </div>
          <Field
            label="Person complained about (optional)"
            htmlFor="complaint-respondent"
            error={v.errorFor("respondent")}
          >
            <Input
              id="complaint-respondent"
              name="respondent"
              placeholder="Leave blank if you would rather not say"
              value={values.respondent}
              onChange={(event) => set("respondent", event.target.value)}
              {...v.fieldProps("respondent", "complaint-respondent")}
            />
          </Field>
          <Field
            label="Date of incident"
            htmlFor="complaint-incident-date"
            error={v.errorFor("incidentDate")}
          >
            <Input
              id="complaint-incident-date"
              name="incidentDate"
              type="date"
              max={manilaToday()}
              value={values.incidentDate}
              onChange={(event) => set("incidentDate", event.target.value)}
              {...v.fieldProps("incidentDate", "complaint-incident-date")}
            />
          </Field>
          <Field
            label="Where it happened"
            htmlFor="complaint-location"
            error={v.errorFor("location")}
          >
            <Input
              id="complaint-location"
              name="location"
              placeholder="e.g. Purok 2 basketball court"
              value={values.location}
              onChange={(event) => set("location", event.target.value)}
              {...v.fieldProps("location", "complaint-location")}
            />
          </Field>
          <Field
            label="What happened"
            htmlFor="complaint-narrative"
            error={v.errorFor("narrative")}
          >
            <Textarea
              id="complaint-narrative"
              name="narrative"
              rows={6}
              placeholder="Describe the incident in your own words."
              value={values.narrative}
              onChange={(event) => set("narrative", event.target.value)}
              {...v.fieldProps("narrative", "complaint-narrative")}
            />
          </Field>
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-ink-600">
              <Checkbox
                name="consent"
                checked={values.consent}
                onChange={(event) => set("consent", event.target.checked)}
                onBlur={() => v.markTouched("consent")}
                aria-invalid={v.errorFor("consent") ? true : undefined}
                aria-describedby={v.errorFor("consent") ? "complaint-consent-error" : undefined}
                className="mt-0.5 shrink-0"
              />
              <span>
                I agree to the barangay recording these details to act on this report (Data
                Privacy Act of 2012).
              </span>
            </label>
            {v.errorFor("consent") ? (
              <p id="complaint-consent-error" role="alert" className="text-sm font-medium text-danger">
                {v.errorFor("consent")}
              </p>
            ) : null}
          </div>
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
    </SwapReveal>
  );
}
