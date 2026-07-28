"use client";

import { useState } from "react";
import type { WalkInAssistanceValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";

interface AssistanceFormProps {
  categories: { id: string; label: string }[];
  onSubmit: (values: WalkInAssistanceValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  onDismissError: () => void;
}

/** Walk-in assistance request encoding. Validation lives in the action; this is the fast feedback. */
export function AssistanceForm({
  categories,
  onSubmit,
  onCancel,
  saving,
  error,
  onDismissError,
}: AssistanceFormProps) {
  const [values, setValues] = useState<WalkInAssistanceValues>({
    firstName: "",
    lastName: "",
    address: "",
    contactNumber: "",
    email: "",
    categoryId: categories[0]?.id ?? "",
    details: "",
    consent: false,
  });

  const set = <K extends keyof WalkInAssistanceValues>(
    key: K,
    value: WalkInAssistanceValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First Name" htmlFor="assistance-walkin-first-name">
            <Input
              id="assistance-walkin-first-name"
              value={values.firstName}
              onChange={(event) => set("firstName", event.target.value)}
            />
          </Field>
          <Field label="Last Name" htmlFor="assistance-walkin-last-name">
            <Input
              id="assistance-walkin-last-name"
              value={values.lastName}
              onChange={(event) => set("lastName", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="assistance-walkin-address">
          <Input
            id="assistance-walkin-address"
            placeholder="Purok 1, Barangay San Fernando"
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact Number" htmlFor="assistance-walkin-contact">
            <Input
              id="assistance-walkin-contact"
              type="tel"
              placeholder="(077) 600-0000"
              value={values.contactNumber}
              onChange={(event) => set("contactNumber", event.target.value)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="assistance-walkin-email">
            <Input
              id="assistance-walkin-email"
              type="email"
              value={values.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Category" htmlFor="assistance-walkin-category">
          <Select
            id="assistance-walkin-category"
            value={values.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Details" htmlFor="assistance-walkin-details">
          <Textarea
            id="assistance-walkin-details"
            rows={6}
            placeholder="Describe what the resident needs help with."
            value={values.details}
            onChange={(event) => set("details", event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-ink-600">
          <Checkbox
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>
            The resident consented to the barangay recording these details for this request
            (Data Privacy Act of 2012).
          </span>
        </label>
        {error ? <InlineAlert message={error} onDismiss={onDismissError} /> : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Encode request"}
        </Button>
      </div>
    </form>
  );
}
