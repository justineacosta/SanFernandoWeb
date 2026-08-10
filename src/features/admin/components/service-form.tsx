"use client";

import { useState, useTransition } from "react";
import type { AdminServiceRow, ServiceFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ICON_OPTIONS } from "@/lib/icon-map";
import { createService, updateService } from "@/features/admin/actions/services";

const DEPARTMENTS = [
  "Office of the Barangay Secretary",
  "Office of the Barangay Treasurer",
  "Barangay Social Welfare Desk",
  "Lupong Tagapamayapa",
  "Barangay Health Center",
  "Office of Senior Citizens Affairs (OSCA)",
];

interface ServiceFormProps {
  /** null = create a new service. */
  record: AdminServiceRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a citizen service. Saves via the create/update actions. */
export function ServiceForm({ record, onSaved, onCancel }: ServiceFormProps) {
  const [values, setValues] = useState<ServiceFormValues>({
    title: record?.title ?? "",
    description: record?.description ?? "",
    department: record?.department ?? DEPARTMENTS[0],
    requirements: record?.requirements.join("\n") ?? "",
    status: record?.status ?? "active",
    iconName: record?.iconName ?? ICON_OPTIONS[0].value,
    tone: record?.tone ?? "primary",
    flow: record?.flow ?? "apply",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceFormValues, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setError(null);
    startTransition(async () => {
      try {
        const result = record
          ? await updateService(record.id, values)
          : await createService(values);
        if (result.error) {
          setError(result.error);
          return;
        }
        onSaved();
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
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
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Icon" htmlFor="service-icon">
            <Select
              id="service-icon"
              value={values.iconName}
              onChange={(event) => set("iconName", event.target.value)}
            >
              {ICON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="service-tone">
            <Select
              id="service-tone"
              value={values.tone}
              onChange={(event) => set("tone", event.target.value as ServiceFormValues["tone"])}
            >
              <option value="primary">Standard</option>
              <option value="danger">Urgent / Report</option>
            </Select>
          </Field>
          <Field label="Destination" htmlFor="service-flow">
            <Select
              id="service-flow"
              value={values.flow}
              onChange={(event) => set("flow", event.target.value as ServiceFormValues["flow"])}
            >
              <option value="apply">Apply form</option>
              <option value="complaint">Complaint form</option>
              <option value="assistance">Assistance form</option>
              <option value="appointment">Appointment form</option>
            </Select>
          </Field>
        </div>
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
        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : record ? "Save Changes" : "Create Service"}
        </Button>
      </div>
    </form>
  );
}
