"use client";

import { useState } from "react";
import type { WalkInAppointmentValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { manilaToday } from "@/lib/format";

interface AppointmentFormProps {
  onSubmit: (values: WalkInAppointmentValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

/** Walk-in appointment encoding. Validation lives in the action; this is the fast feedback. */
export function AppointmentForm({ onSubmit, onCancel, saving, error }: AppointmentFormProps) {
  const [values, setValues] = useState<WalkInAppointmentValues>({
    firstName: "",
    lastName: "",
    address: "",
    contactNumber: "",
    email: "",
    purpose: "",
    preferredDate: manilaToday(),
    preferredPeriod: "am",
    consent: false,
  });

  const set = <K extends keyof WalkInAppointmentValues>(
    key: K,
    value: WalkInAppointmentValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="appointment-walkin-first-name">
            <Input
              id="appointment-walkin-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
            />
          </Field>
          <Field label="Last Name" htmlFor="appointment-walkin-last-name">
            <Input
              id="appointment-walkin-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="appointment-walkin-address">
          <Input
            id="appointment-walkin-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="appointment-walkin-contact">
            <Input
              id="appointment-walkin-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="appointment-walkin-email">
            <Input
              id="appointment-walkin-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Purpose" htmlFor="appointment-walkin-purpose">
          <Textarea
            id="appointment-walkin-purpose"
            rows={4}
            placeholder="e.g. Consultation with the Punong Barangay"
            value={values.purpose}
            onChange={(event) => set("purpose", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preferred Date" htmlFor="appointment-walkin-preferred-date">
            <Input
              id="appointment-walkin-preferred-date"
              type="date"
              min={manilaToday()}
              value={values.preferredDate}
              onChange={(event) => set("preferredDate", event.target.value)}
            />
          </Field>
          <Field label="Preferred Time" htmlFor="appointment-walkin-preferred-period">
            <Select
              id="appointment-walkin-preferred-period"
              value={values.preferredPeriod}
              onChange={(event) =>
                set("preferredPeriod", event.target.value as WalkInAppointmentValues["preferredPeriod"])
              }
            >
              <option value="am">Morning (8:00 AM – 12:00 NN)</option>
              <option value="pm">Afternoon (1:00 PM – 5:00 PM)</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            The resident consented to the barangay recording these details for this appointment
            (Data Privacy Act of 2012).
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Encode appointment"}
        </Button>
      </div>
    </form>
  );
}
