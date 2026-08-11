"use client";

import { useState } from "react";
import type { WalkInApplicationValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TicketFileField } from "@/components/shared/ticket-file-field";
import { manilaToday } from "@/lib/format";

interface ApplicationFormProps {
  services: { id: string; title: string }[];
  onSubmit: (values: WalkInApplicationValues, files: File[]) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}

/** Walk-in application encoding. Validation lives in the action; this is the fast feedback. */
export function ApplicationForm({
  services,
  onSubmit,
  onCancel,
  saving,
  error,
  onDismissError,
}: ApplicationFormProps) {
  const [values, setValues] = useState<WalkInApplicationValues>({
    firstName: "",
    middleName: "",
    lastName: "",
    birthDate: "",
    address: "",
    contactNumber: "",
    email: "",
    purpose: "",
    serviceId: services[0]?.id ?? "",
    consent: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);

  const set = <K extends keyof WalkInApplicationValues>(
    key: K,
    value: WalkInApplicationValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values, files);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="application-first-name">
            <Input
              id="application-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
            />
          </Field>
          <Field label="Middle Name (optional)" htmlFor="application-middle-name">
            <Input
              id="application-middle-name"
              value={values.middleName}
              onChange={(event) => set("middleName", event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Last Name" htmlFor="application-last-name">
            <Input
              id="application-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
            />
          </Field>
          <Field label="Date of Birth" htmlFor="application-birth-date">
            <Input
              id="application-birth-date"
              type="date"
              max={manilaToday()}
              value={values.birthDate}
              onChange={(event) => set("birthDate", event.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="application-contact">
            <Input
              id="application-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="application-email">
            <Input
              id="application-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="application-address">
          <Input
            id="application-address"
            placeholder="Sitio 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </Field>
        <Field label="Document Type" htmlFor="application-service">
          <Select
            id="application-service"
            value={values.serviceId}
            onChange={(event) => set("serviceId", event.target.value)}
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Purpose (optional)" htmlFor="application-purpose">
          <Textarea
            id="application-purpose"
            rows={4}
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="walkin-application"
          label="Documents handed over (optional)"
        />
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            The applicant consented to the barangay recording these details for this request
            (Data Privacy Act of 2012).
          </span>
        </label>
        {error ? <InlineAlert message={error} onDismiss={onDismissError} /> : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || filePreparing || fileError !== null}>
          {saving ? "Saving…" : "Encode application"}
        </Button>
      </div>
    </form>
  );
}
