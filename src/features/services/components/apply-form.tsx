"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { PublicApplicationValues } from "@/types";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { FormSectionLabel } from "@/components/ui/form-section-label";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TicketFileField } from "@/components/shared/ticket-file-field";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { manilaToday } from "@/lib/format";
import { submitApplication } from "@/features/services/actions";
import { applicationSchema } from "@/features/services/schema";
import { SwapReveal } from "@/components/ui/swap-reveal";

interface ApplyFormProps {
  serviceId: string;
  serviceTitle: string;
  requirements: string[];
}

const EMPTY: PublicApplicationValues = {
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
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
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one application. This ref closes that window.
  const submitting = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const set = <K extends keyof PublicApplicationValues>(key: K, value: PublicApplicationValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const v = useFieldValidation(applicationSchema, values);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!v.revealAll(event.currentTarget as HTMLFormElement)) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitApplication(serviceId, values, files, turnstileToken);
        if (result.error || !result.ticketNo) {
          setError(result.error ?? "Something went wrong. Please try again.");
          return;
        }
        setAttachmentWarning(result.attachmentWarning);
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
            Application <BrandStroke>filed</BrandStroke>
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
          {attachmentWarning ? (
            <InlineAlert
              message={attachmentWarning}
              onDismiss={() => setAttachmentWarning(null)}
              className="mb-6 text-left"
            />
          ) : null}
          <div className="mb-6 rounded-2xl border border-ink-200 bg-ink-50 p-6 text-left">
            <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
              <li>Barangay staff review your request.</li>
              <li>Once approved, your status changes to ready for pickup.</li>
              <li>Bring the requirements and a valid ID to the barangay hall to claim it.</li>
            </ol>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
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
      </SwapReveal>
    );
  }

  return (
    <SwapReveal face="form">
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {requirements.length > 0 ? (
          <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
            <p className="mb-3 font-semibold text-ink-900">
              Bring these when you claim your {serviceTitle}
            </p>
            <ul className="space-y-2 text-sm text-ink-600">
              {requirements.map((requirement, index) => (
                <li key={`${index}-${requirement}`} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                  <span>{requirement}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card className="space-y-5 rounded-3xl p-8">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="First name" htmlFor="apply-first-name" error={v.errorFor("firstName")}>
              <Input
                id="apply-first-name"
                name="firstName"
                value={values.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                autoComplete="given-name"
                {...v.fieldProps("firstName", "apply-first-name")}
              />
            </Field>
            <Field
              label="Middle name (optional)"
              htmlFor="apply-middle-name"
              error={v.errorFor("middleName")}
            >
              <Input
                id="apply-middle-name"
                name="middleName"
                value={values.middleName}
                onChange={(event) => set("middleName", event.target.value)}
                autoComplete="additional-name"
                {...v.fieldProps("middleName", "apply-middle-name")}
              />
            </Field>
            <Field label="Last name" htmlFor="apply-last-name" error={v.errorFor("lastName")}>
              <Input
                id="apply-last-name"
                name="lastName"
                value={values.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                autoComplete="family-name"
                {...v.fieldProps("lastName", "apply-last-name")}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Date of birth"
              htmlFor="apply-birth-date"
              error={v.errorFor("birthDate")}
            >
              <Input
                id="apply-birth-date"
                name="birthDate"
                type="date"
                max={manilaToday()}
                value={values.birthDate}
                onChange={(event) => set("birthDate", event.target.value)}
                autoComplete="bday"
                {...v.fieldProps("birthDate", "apply-birth-date")}
              />
            </Field>
            <Field
              label="Contact number"
              htmlFor="apply-contact"
              error={v.errorFor("contactNumber")}
            >
              <Input
                id="apply-contact"
                name="contactNumber"
                type="tel"
                placeholder="(077) 600-0000"
                value={values.contactNumber}
                onChange={(event) => set("contactNumber", event.target.value)}
                autoComplete="tel"
                {...v.fieldProps("contactNumber", "apply-contact")}
              />
            </Field>
          </div>
          <Field
            label="Sitio / street address"
            htmlFor="apply-address"
            error={v.errorFor("address")}
          >
            <Input
              id="apply-address"
              name="address"
              placeholder="Sitio 1, Barangay San Fernando"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              autoComplete="street-address"
              {...v.fieldProps("address", "apply-address")}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="apply-email" error={v.errorFor("email")}>
            <Input
              id="apply-email"
              name="email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
              autoComplete="email"
              {...v.fieldProps("email", "apply-email")}
            />
          </Field>
          <FormSectionLabel>Your request</FormSectionLabel>
          <Field label="Purpose (optional)" htmlFor="apply-purpose" error={v.errorFor("purpose")}>
            <Textarea
              id="apply-purpose"
              name="purpose"
              rows={4}
              placeholder="e.g. Employment requirement"
              value={values.purpose}
              onChange={(event) => set("purpose", event.target.value)}
              {...v.fieldProps("purpose", "apply-purpose")}
            />
          </Field>
          <TicketFileField
            files={files}
            onFilesChange={setFiles}
            error={fileError}
            onErrorChange={setFileError}
            preparing={filePreparing}
            onPreparingChange={setFilePreparing}
            idPrefix="apply"
          />
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-ink-600">
              <Checkbox
                name="consent"
                checked={values.consent}
                onChange={(event) => set("consent", event.target.checked)}
                onBlur={() => v.markTouched("consent")}
                aria-invalid={v.errorFor("consent") ? true : undefined}
                aria-describedby={v.errorFor("consent") ? "apply-consent-error" : undefined}
                className="mt-0.5 shrink-0"
              />
              <span>
                I allow Barangay San Fernando to collect and process the details above for this
                request, in line with the Data Privacy Act of 2012.
              </span>
            </label>
            {v.errorFor("consent") ? (
              <p id="apply-consent-error" role="alert" className="text-sm font-medium text-danger">
                {v.errorFor("consent")}
              </p>
            ) : null}
          </div>
          <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
          {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isPending || filePreparing || fileError !== null}
          >
            {isPending ? "Filing…" : "Submit application"}
          </Button>
        </Card>
      </form>
    </SwapReveal>
  );
}
