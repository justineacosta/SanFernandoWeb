"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { submitApplication } from "@/features/services/actions";

interface ApplyFormProps {
  serviceId: string;
  serviceTitle: string;
  requirements: string[];
}

const EMPTY: PublicApplicationValues = {
  firstName: "",
  lastName: "",
  address: "",
  contactNumber: "",
  email: "",
  purpose: "",
  consent: false,
};

/** Public application form; swaps to a ticket receipt on success. */
export function ApplyForm({ serviceId, serviceTitle, requirements }: ApplyFormProps) {
  const [values, setValues] = useState<PublicApplicationValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one application. This ref closes that window.
  const submitting = useRef(false);

  const set = <K extends keyof PublicApplicationValues>(key: K, value: PublicApplicationValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitApplication(serviceId, values);
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

  async function copyTicket() {
    if (!ticketNo) return;
    try {
      await navigator.clipboard.writeText(ticketNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the number is on screen to copy by hand.
    }
  }

  if (ticketNo) {
    return (
      <Card className="rounded-3xl p-8">
        <CheckCircle2 className="mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">
          Application filed
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
            {copied ? "Copied" : "Copy number"}
          </button>
        </div>
        <div className="mb-6 rounded-2xl border border-ink-200 bg-ink-50 p-6">
          <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
            <li>Barangay staff review your request.</li>
            <li>Once approved, your status changes to ready for pickup.</li>
            <li>Bring the requirements and a valid ID to the barangay hall to claim it.</li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/track?ticket=${encodeURIComponent(ticketNo)}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Track this application
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
      {requirements.length > 0 ? (
        <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
          <p className="mb-3 font-semibold text-ink-900">
            Bring these when you claim your {serviceTitle}
          </p>
          <ul className="space-y-2 text-sm text-ink-600">
            {requirements.map((requirement) => (
              <li key={requirement} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                <span>{requirement}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="space-y-5 rounded-3xl p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" htmlFor="apply-first-name">
            <Input
              id="apply-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name" htmlFor="apply-last-name">
            <Input
              id="apply-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
        <Field label="Purok / street address" htmlFor="apply-address">
          <Input
            id="apply-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            autoComplete="street-address"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact number" htmlFor="apply-contact">
            <Input
              id="apply-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              autoComplete="tel"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="apply-email">
            <Input
              id="apply-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>
        <Field label="Purpose" htmlFor="apply-purpose">
          <Textarea
            id="apply-purpose"
            rows={4}
            placeholder="e.g. Employment requirement"
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            I allow Barangay San Fernando to collect and process the details above for this
            request, in line with the Data Privacy Act of 2012.
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Filing…" : "Submit application"}
        </Button>
      </Card>
    </form>
  );
}
