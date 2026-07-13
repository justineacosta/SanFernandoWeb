"use client";

import { useState } from "react";
import type { AdminServiceRecord, ServiceFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const DEPARTMENTS = [
  "Office of the Barangay Secretary",
  "Office of the Barangay Treasurer",
  "Barangay Social Welfare Desk",
  "Lupong Tagapamayapa",
  "Barangay Health Center",
  "Office of Senior Citizens Affairs (OSCA)",
];

interface ServiceFormProps {
  record: AdminServiceRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a citizen service. Validates, then fake-saves (no persistence). */
export function ServiceForm({ record, onSaved, onCancel }: ServiceFormProps) {
  const [values, setValues] = useState<ServiceFormValues>({
    title: record?.service.title ?? "",
    description: record?.service.description ?? "",
    department: record?.department ?? DEPARTMENTS[0],
    requirements: record?.service.requirements.join("\n") ?? "",
    status: record?.status ?? "active",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Service name is required.";
    if (!values.description.trim()) nextErrors.description = "Description is required.";
    if (!values.requirements.trim()) nextErrors.requirements = "List at least one requirement.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSaved();
    }, 600);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Service Name" htmlFor="service-title">
          <Input
            id="service-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <Field label="Description" htmlFor="service-description">
          <Textarea
            id="service-description"
            rows={3}
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description ? <p className="text-sm text-danger">{errors.description}</p> : null}
        </Field>
        <Field label="Department" htmlFor="service-department">
          <Select
            id="service-department"
            value={values.department}
            onChange={(event) => set("department", event.target.value)}
          >
            {DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Requirements (one per line)" htmlFor="service-requirements">
          <Textarea
            id="service-requirements"
            rows={4}
            value={values.requirements}
            onChange={(event) => set("requirements", event.target.value)}
            aria-invalid={Boolean(errors.requirements)}
          />
          {errors.requirements ? (
            <p className="text-sm text-danger">{errors.requirements}</p>
          ) : null}
        </Field>
        <Field label="Status" htmlFor="service-status">
          <Select
            id="service-status"
            value={values.status}
            onChange={(event) => set("status", event.target.value as ServiceFormValues["status"])}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Add Service"}
        </Button>
      </div>
    </form>
  );
}
