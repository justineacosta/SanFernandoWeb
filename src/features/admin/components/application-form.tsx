"use client";

import { useState } from "react";
import type { ApplicationFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { CERTIFICATE_SERVICES } from "@/features/admin/data";

interface ApplicationFormProps {
  onSubmit: (values: ApplicationFormValues) => void;
  onCancel: () => void;
}

/** Walk-in application encoding form. Validates, then fake-saves as a pending record. */
export function ApplicationForm({ onSubmit, onCancel }: ApplicationFormProps) {
  const [values, setValues] = useState<ApplicationFormValues>({
    applicantName: "",
    contactNumber: "",
    email: "",
    address: "",
    serviceId: CERTIFICATE_SERVICES[0]?.id ?? "",
    purpose: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ApplicationFormValues>(key: K, value: ApplicationFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.applicantName.trim()) nextErrors.applicantName = "Applicant name is required.";
    if (!values.contactNumber.trim()) nextErrors.contactNumber = "Contact number is required.";
    if (values.email?.trim() && !/^\S+@\S+\.\S+$/.test(values.email.trim()))
      nextErrors.email = "Enter a valid email address.";
    if (!values.address.trim()) nextErrors.address = "Address is required.";
    if (!values.purpose.trim()) nextErrors.purpose = "Purpose is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSubmit(values);
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Applicant Name" htmlFor="application-name">
          <Input
            id="application-name"
            value={values.applicantName}
            onChange={(event) => set("applicantName", event.target.value)}
            aria-invalid={Boolean(errors.applicantName)}
          />
          {errors.applicantName ? (
            <p className="text-sm text-danger">{errors.applicantName}</p>
          ) : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="application-contact">
            <Input
              id="application-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
              aria-invalid={Boolean(errors.contactNumber)}
            />
            {errors.contactNumber ? (
              <p className="text-sm text-danger">{errors.contactNumber}</p>
            ) : null}
          </Field>
          <Field label="Email (optional)" htmlFor="application-email">
            <Input
              id="application-email"
              type="email"
              value={values.email ?? ""}
              onChange={(event) => set("email", event.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? <p className="text-sm text-danger">{errors.email}</p> : null}
          </Field>
        </div>
        <Field label="Address" htmlFor="application-address">
          <Input
            id="application-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
            aria-invalid={Boolean(errors.address)}
          />
          {errors.address ? <p className="text-sm text-danger">{errors.address}</p> : null}
        </Field>
        <Field label="Certificate Type" htmlFor="application-service">
          <Select
            id="application-service"
            value={values.serviceId}
            onChange={(event) => set("serviceId", event.target.value)}
          >
            {CERTIFICATE_SERVICES.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purpose" htmlFor="application-purpose">
          <Textarea
            id="application-purpose"
            rows={4}
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
            aria-invalid={Boolean(errors.purpose)}
          />
          {errors.purpose ? <p className="text-sm text-danger">{errors.purpose}</p> : null}
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
