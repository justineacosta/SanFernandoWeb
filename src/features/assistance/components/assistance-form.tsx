"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import type { AssistanceCategoryRow, PublicAssistanceValues } from "@/types";
import { Button } from "@/components/ui/button";
import { BrandStroke } from "@/components/ui/brand-stroke";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { TicketFileField } from "@/components/shared/ticket-file-field";
import { submitAssistance } from "@/features/assistance/actions";
import { assistanceSchema } from "@/features/assistance/schema";
import { SwapReveal } from "@/components/ui/swap-reveal";

/** Public assistance request form; swaps to a ticket receipt on success. */
export function AssistanceForm({ categories }: { categories: AssistanceCategoryRow[] }) {
  const [values, setValues] = useState<PublicAssistanceValues>({
    firstName: "",
    lastName: "",
    address: "",
    contactNumber: "",
    email: "",
    categoryId: categories[0]?.id ?? "",
    details: "",
    consent: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNo, setTicketNo] = useState<string | null>(null);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the
  // resident two tickets for one request. This ref closes that window.
  const submitting = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const set = <K extends keyof PublicAssistanceValues>(key: K, value: PublicAssistanceValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const v = useFieldValidation(assistanceSchema, values);
  const selected = categories.find((category) => category.id === values.categoryId);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!v.revealAll(event.currentTarget as HTMLFormElement)) return;
    submitting.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitAssistance(values, files, turnstileToken);
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
            Request <BrandStroke>filed</BrandStroke>
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
          <div className="mb-6 mt-6 rounded-2xl border border-ink-200 bg-ink-50 p-6 text-left">
            <p className="mb-2 text-sm font-semibold text-ink-900">What happens next</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-600">
              <li>Barangay staff log and review your request.</li>
              <li>The Barangay Social Welfare Desk assesses it and may contact you.</li>
              <li>Track your ticket number anytime to see its status.</li>
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
        <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
          <p className="mb-3 font-semibold text-ink-900">Before you file</p>
          <ul className="space-y-2 text-sm text-ink-600">
            {[
              "Every request is reviewed by the Barangay Social Welfare Desk.",
              "A staff visit or follow-up call may follow.",
              "This is a request for assessment, not cash released on the spot.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-5 rounded-3xl p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="First name"
              htmlFor="assistance-first-name"
              error={v.errorFor("firstName")}
            >
              <Input
                id="assistance-first-name"
                name="firstName"
                value={values.firstName}
                onChange={(event) => set("firstName", event.target.value)}
                autoComplete="given-name"
                {...v.fieldProps("firstName", "assistance-first-name")}
              />
            </Field>
            <Field label="Last name" htmlFor="assistance-last-name" error={v.errorFor("lastName")}>
              <Input
                id="assistance-last-name"
                name="lastName"
                value={values.lastName}
                onChange={(event) => set("lastName", event.target.value)}
                autoComplete="family-name"
                {...v.fieldProps("lastName", "assistance-last-name")}
              />
            </Field>
          </div>
          <Field
            label="Sitio / street address"
            htmlFor="assistance-address"
            error={v.errorFor("address")}
          >
            <Input
              id="assistance-address"
              name="address"
              placeholder="Sitio 1, Barangay San Fernando"
              value={values.address}
              onChange={(event) => set("address", event.target.value)}
              autoComplete="street-address"
              {...v.fieldProps("address", "assistance-address")}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Contact number"
              htmlFor="assistance-contact"
              error={v.errorFor("contactNumber")}
            >
              <Input
                id="assistance-contact"
                name="contactNumber"
                type="tel"
                placeholder="(077) 600-0000"
                value={values.contactNumber}
                onChange={(event) => set("contactNumber", event.target.value)}
                autoComplete="tel"
                {...v.fieldProps("contactNumber", "assistance-contact")}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="assistance-email" error={v.errorFor("email")}>
              <Input
                id="assistance-email"
                name="email"
                type="email"
                value={values.email}
                onChange={(event) => set("email", event.target.value)}
                autoComplete="email"
                {...v.fieldProps("email", "assistance-email")}
              />
            </Field>
          </div>
          <Field
            label="What kind of assistance?"
            htmlFor="assistance-category"
            error={v.errorFor("categoryId")}
          >
            <Select
              id="assistance-category"
              name="categoryId"
              value={values.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
              {...v.fieldProps("categoryId", "assistance-category")}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (selected.description || selected.requirements.length > 0) ? (
            <Card className="rounded-3xl border-brand-200 bg-brand-100/50 p-6">
              <p className="mb-3 font-semibold text-ink-900">What to prepare</p>
              {selected.description ? (
                <p className="mb-3 text-sm text-ink-600">{selected.description}</p>
              ) : null}
              <ul className="space-y-2 text-sm text-ink-600">
                {selected.requirements.map((requirement, index) => (
                  <li key={`${index}-${requirement}`} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-500"
                      aria-hidden="true"
                    />
                    <span>{requirement}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Field
            label="Tell us about your situation"
            htmlFor="assistance-details"
            error={v.errorFor("details")}
          >
            <Textarea
              id="assistance-details"
              name="details"
              rows={5}
              placeholder="Explain what you need and why, in your own words."
              value={values.details}
              onChange={(event) => set("details", event.target.value)}
              {...v.fieldProps("details", "assistance-details")}
            />
            <p className="text-right text-xs text-ink-500" aria-live="polite">
              {values.details.trim().length < 20
                ? `${values.details.trim().length} / 20 characters minimum`
                : `${values.details.trim().length} / 2000`}
            </p>
          </Field>
          <TicketFileField
            files={files}
            onFilesChange={setFiles}
            error={fileError}
            onErrorChange={setFileError}
            preparing={filePreparing}
            onPreparingChange={setFilePreparing}
            idPrefix="assistance"
          />
          <div className="space-y-2">
            <label className="flex items-start gap-3 text-sm text-ink-600">
              <Checkbox
                name="consent"
                checked={values.consent}
                onChange={(event) => set("consent", event.target.checked)}
                onBlur={() => v.markTouched("consent")}
                aria-invalid={v.errorFor("consent") ? true : undefined}
                aria-describedby={v.errorFor("consent") ? "assistance-consent-error" : undefined}
                className="mt-0.5 shrink-0"
              />
              <span>
                I agree to the barangay recording these details to assess this request (Data
                Privacy Act of 2012).
              </span>
            </label>
            {v.errorFor("consent") ? (
              <p
                id="assistance-consent-error"
                role="alert"
                className="text-sm font-medium text-danger"
              >
                {v.errorFor("consent")}
              </p>
            ) : null}
          </div>
          {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
          <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
          {/* fileError clears itself on the next valid pick, so unlike `error`
              there's no dismiss button to route around it — the only way past
              a rejected file is to fix the file input, exactly what the field-
              level comment above intends. Without this, Submit stayed
              clickable and silently filed a ticket with no attachments. */}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isPending || filePreparing || fileError !== null}
          >
            {isPending ? "Filing…" : "Submit request"}
          </Button>
        </Card>
      </form>
    </SwapReveal>
  );
}
