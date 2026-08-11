"use client";

import { useState } from "react";
import type { WalkInComplaintValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TicketFileField } from "@/components/shared/ticket-file-field";
import { manilaToday } from "@/lib/format";

interface ComplaintFormProps {
  onSubmit: (values: WalkInComplaintValues, files: File[]) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}

/** Walk-in incident report encoding. Validation lives in the action; this is the fast feedback. */
export function ComplaintForm({
  onSubmit,
  onCancel,
  saving,
  error,
  onDismissError,
}: ComplaintFormProps) {
  const [values, setValues] = useState<WalkInComplaintValues>({
    firstName: "",
    lastName: "",
    address: "",
    contactNumber: "",
    email: "",
    respondent: "",
    incidentDate: manilaToday(),
    location: "",
    narrative: "",
    consent: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [filePreparing, setFilePreparing] = useState(false);

  const set = <K extends keyof WalkInComplaintValues>(
    key: K,
    value: WalkInComplaintValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values, files);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="complaint-walkin-first-name">
            <Input
              id="complaint-walkin-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
            />
          </Field>
          <Field label="Last Name" htmlFor="complaint-walkin-last-name">
            <Input
              id="complaint-walkin-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="complaint-walkin-address">
          <Input
            id="complaint-walkin-address"
            placeholder="Sitio 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="complaint-walkin-contact">
            <Input
              id="complaint-walkin-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="complaint-walkin-email">
            <Input
              id="complaint-walkin-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Person Complained About (optional)" htmlFor="complaint-walkin-respondent">
          <Input
            id="complaint-walkin-respondent"
            placeholder="Leave blank if not named"
            value={values.respondent}
            onChange={(event) => set("respondent", event.target.value)}
          />
        </Field>
        <Field label="Date of Incident" htmlFor="complaint-walkin-incident-date">
          <Input
            id="complaint-walkin-incident-date"
            type="date"
            max={manilaToday()}
            value={values.incidentDate}
            onChange={(event) => set("incidentDate", event.target.value)}
          />
        </Field>
        <Field label="Where It Happened" htmlFor="complaint-walkin-location">
          <Input
            id="complaint-walkin-location"
            placeholder="e.g. Sitio 2 basketball court"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
          />
        </Field>
        <Field label="What Happened" htmlFor="complaint-walkin-narrative">
          <Textarea
            id="complaint-walkin-narrative"
            rows={6}
            placeholder="Describe the incident in the complainant's own words."
            value={values.narrative}
            onChange={(event) => set("narrative", event.target.value)}
          />
        </Field>
        <TicketFileField
          files={files}
          onFilesChange={setFiles}
          error={fileError}
          onErrorChange={setFileError}
          preparing={filePreparing}
          onPreparingChange={setFilePreparing}
          idPrefix="walkin-complaint"
          label="Photos or documents (optional)"
        />
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            The complainant consented to the barangay recording these details for this report
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
          {saving ? "Saving…" : "Encode report"}
        </Button>
      </div>
    </form>
  );
}
