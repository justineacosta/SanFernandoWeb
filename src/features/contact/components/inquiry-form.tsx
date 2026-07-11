"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { INQUIRY_SUBJECTS } from "@/features/contact/data";

type FormStatus = "idle" | "submitting" | "sent";

/** Citizen inquiry form with client-side submit feedback. */
export function InquiryForm() {
  const [status, setStatus] = useState<FormStatus>("idle");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("submitting");
    // Simulate a round-trip until a backend endpoint is wired up.
    window.setTimeout(() => {
      setStatus("sent");
      form.reset();
      window.setTimeout(() => setStatus("idle"), 3000);
    }, 1200);
  }

  return (
    <Card className="rounded-3xl p-8 md:p-10">
      <h2 className="mb-2 text-2xl font-semibold tracking-tight text-ink-900">Send an Inquiry</h2>
      <p className="mb-8 text-ink-600">
        Fill out the form below and our staff will get back to you within 24-48 business hours.
      </p>
      <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={handleSubmit}>
        <Field label="First Name" htmlFor="firstName">
          <Input id="firstName" name="firstName" placeholder="Juan" required />
        </Field>
        <Field label="Last Name" htmlFor="lastName">
          <Input id="lastName" name="lastName" placeholder="Dela Cruz" required />
        </Field>
        <Field label="Email Address" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="juan.dc@email.com" required />
        </Field>
        <Field label="Phone Number (Optional)" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" placeholder="09XX XXX XXXX" />
        </Field>
        <Field label="Subject" htmlFor="subject" className="md:col-span-2">
          <Select id="subject" name="subject">
            {INQUIRY_SUBJECTS.map((subject) => (
              <option key={subject.value} value={subject.value}>
                {subject.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Message" htmlFor="message" className="md:col-span-2">
          <Textarea
            id="message"
            name="message"
            rows={5}
            placeholder="How can we help you?"
            required
          />
        </Field>
        <div className="flex items-center gap-3 py-2 md:col-span-2">
          <Checkbox id="terms" required />
          <label htmlFor="terms" className="text-sm text-ink-600">
            I agree to the processing of my personal data for the purpose of this inquiry.
          </label>
        </div>
        <div className="pt-4 md:col-span-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={status !== "idle"}
            className={status === "sent" ? "rounded-2xl bg-brand-100 text-brand-800 hover:bg-brand-100" : undefined}
          >
            {status === "idle" ? (
              <>
                Submit Inquiry <Send className="h-5 w-5" aria-hidden="true" />
              </>
            ) : status === "submitting" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Sending...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Message Sent!
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}
