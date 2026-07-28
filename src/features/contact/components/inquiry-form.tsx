"use client";

import { useRef, useState, useTransition } from "react";
import { CheckCircle2, Send } from "lucide-react";
import type { PublicInquiryValues } from "@/types";
import { SITE } from "@/constants/site";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { submitInquiry } from "@/features/contact/actions";
import { INQUIRY_SUBJECTS } from "@/features/contact/data";
import { inquirySchema } from "@/features/contact/schema";

const EMPTY: PublicInquiryValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  subject: INQUIRY_SUBJECTS[0].value,
  message: "",
  consent: false,
};

/** Citizen inquiry form. Persists to `inquiries`; staff answer it from the admin inbox. */
export function InquiryForm() {
  const [values, setValues] = useState<PublicInquiryValues>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // `isPending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick — that would file the same
  // message twice. This ref closes that window.
  const submitting = useRef(false);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const set = <K extends keyof PublicInquiryValues>(key: K, value: PublicInquiryValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const v = useFieldValidation(inquirySchema, values);

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
        const result = await submitInquiry(values, turnstileToken);
        if (result.error) {
          setError(result.error);
          return;
        }
        setSent(true);
      } finally {
        submitting.current = false;
        turnstileRef.current?.reset();
        setTurnstileToken(null);
      }
    });
  }

  if (sent) {
    return (
      <Card className="rounded-3xl p-8 md:p-10">
        <CheckCircle2 className="mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
        <h2 className="mb-2 font-display text-2xl font-bold text-ink-900">Message received</h2>
        <p className="mb-6 text-ink-600">
          Barangay staff will reply to <span className="font-semibold">{values.email}</span> within
          24&ndash;48 business hours. If it cannot wait that long, please call{" "}
          <a href={`tel:${SITE.phone.replace(/\s/g, "")}`} className="font-semibold text-brand-700 hover:underline">
            {SITE.phone}
          </a>
          .
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setValues(EMPTY);
            setSent(false);
          }}
        >
          Send another message
        </Button>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl p-8 md:p-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight text-ink-900">Send an Inquiry</h2>
      <p className="mb-8 text-ink-600">
        Fill out the form below and our staff will get back to you within 24-48 business hours.
      </p>
      <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={handleSubmit} noValidate>
        <Field label="First Name" htmlFor="inquiry-first-name" error={v.errorFor("firstName")}>
          <Input
            id="inquiry-first-name"
            name="firstName"
            placeholder="Juan"
            value={values.firstName}
            onChange={(event) => set("firstName", event.target.value)}
            autoComplete="given-name"
            {...v.fieldProps("firstName", "inquiry-first-name")}
          />
        </Field>
        <Field label="Last Name" htmlFor="inquiry-last-name" error={v.errorFor("lastName")}>
          <Input
            id="inquiry-last-name"
            name="lastName"
            placeholder="Dela Cruz"
            value={values.lastName}
            onChange={(event) => set("lastName", event.target.value)}
            autoComplete="family-name"
            {...v.fieldProps("lastName", "inquiry-last-name")}
          />
        </Field>
        <Field
          label="Email Address"
          htmlFor="inquiry-email"
          hint="This is where the reply is sent."
          error={v.errorFor("email")}
        >
          <Input
            id="inquiry-email"
            name="email"
            type="email"
            placeholder="juan.dc@email.com"
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            autoComplete="email"
            {...v.fieldProps("email", "inquiry-email")}
          />
        </Field>
        <Field label="Phone Number (Optional)" htmlFor="inquiry-phone" error={v.errorFor("phone")}>
          <Input
            id="inquiry-phone"
            name="phone"
            type="tel"
            placeholder="09XX XXX XXXX"
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            autoComplete="tel"
            {...v.fieldProps("phone", "inquiry-phone")}
          />
        </Field>
        <Field
          label="Subject"
          htmlFor="inquiry-subject"
          className="md:col-span-2"
          error={v.errorFor("subject")}
        >
          <Select
            id="inquiry-subject"
            name="subject"
            value={values.subject}
            onChange={(event) => set("subject", event.target.value)}
            {...v.fieldProps("subject", "inquiry-subject")}
          >
            {INQUIRY_SUBJECTS.map((subject) => (
              <option key={subject.value} value={subject.value}>
                {subject.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Message"
          htmlFor="inquiry-message"
          className="md:col-span-2"
          error={v.errorFor("message")}
        >
          <Textarea
            id="inquiry-message"
            name="message"
            rows={5}
            placeholder="How can we help you?"
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            {...v.fieldProps("message", "inquiry-message")}
          />
        </Field>
        <div className="space-y-2 py-2 md:col-span-2">
          <label className="flex items-start gap-3 text-sm text-ink-600">
            <Checkbox
              name="consent"
              checked={values.consent}
              onChange={(event) => set("consent", event.target.checked)}
              onBlur={() => v.markTouched("consent")}
              aria-invalid={v.errorFor("consent") ? true : undefined}
              aria-describedby={v.errorFor("consent") ? "inquiry-consent-error" : undefined}
              className="mt-0.5 shrink-0"
            />
            <span>
              I agree to the processing of my personal data for the purpose of this inquiry (Data
              Privacy Act of 2012).
            </span>
          </label>
          {v.errorFor("consent") ? (
            <p id="inquiry-consent-error" role="alert" className="text-sm font-medium text-danger">
              {v.errorFor("consent")}
            </p>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger md:col-span-2">
            {error}
          </p>
        ) : null}
        <TurnstileWidget ref={turnstileRef} onVerify={setTurnstileToken} className="flex justify-center" />
        <div className="pt-4 md:col-span-2">
          <Button type="submit" variant="primary" size="lg" disabled={isPending}>
            {isPending ? (
              "Sending…"
            ) : (
              <>
                Submit Inquiry <Send className="h-5 w-5" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
