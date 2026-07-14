"use client";

import { useState } from "react";
import type { AdminEventRecord, EventFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EVENT_CATEGORY_LABELS } from "@/features/admin/data";

interface EventFormProps {
  record: AdminEventRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a community event. Validates, then fake-saves. */
export function EventForm({ record, onSaved, onCancel }: EventFormProps) {
  // Public CommunityEvent stores time as a display string ("8:00 AM - 3:00 PM").
  const timeParts = record?.event.time.split(" - ") ?? [];
  const [values, setValues] = useState<EventFormValues>({
    title: record?.event.title ?? "",
    category: record?.category ?? "community",
    date: record?.event.date ?? "",
    startTime: timeParts[0] ?? "",
    endTime: timeParts[1] ?? "",
    venue: record?.event.venue ?? "",
    capacity: record?.capacity,
    description: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Event title is required.";
    if (!values.date) nextErrors.date = "Event date is required.";
    if (!values.startTime.trim()) nextErrors.startTime = "Start time is required.";
    if (!values.venue.trim()) nextErrors.venue = "Venue is required.";
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
        <Field label="Event Title" htmlFor="event-title">
          <Input
            id="event-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="event-category">
            <Select
              id="event-category"
              value={values.category}
              onChange={(event) =>
                set("category", event.target.value as EventFormValues["category"])
              }
            >
              {Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="event-date">
            <Input
              id="event-date"
              type="date"
              value={values.date}
              onChange={(event) => set("date", event.target.value)}
              aria-invalid={Boolean(errors.date)}
            />
            {errors.date ? <p className="text-sm text-danger">{errors.date}</p> : null}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start Time" htmlFor="event-start">
            <Input
              id="event-start"
              placeholder="8:00 AM"
              value={values.startTime}
              onChange={(event) => set("startTime", event.target.value)}
              aria-invalid={Boolean(errors.startTime)}
            />
            {errors.startTime ? <p className="text-sm text-danger">{errors.startTime}</p> : null}
          </Field>
          <Field label="End Time" htmlFor="event-end">
            <Input
              id="event-end"
              placeholder="3:00 PM"
              value={values.endTime}
              onChange={(event) => set("endTime", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Venue" htmlFor="event-venue">
          <Input
            id="event-venue"
            value={values.venue}
            onChange={(event) => set("venue", event.target.value)}
            aria-invalid={Boolean(errors.venue)}
          />
          {errors.venue ? <p className="text-sm text-danger">{errors.venue}</p> : null}
        </Field>
        <Field label="Capacity (optional)" htmlFor="event-capacity">
          <Input
            id="event-capacity"
            type="number"
            min={1}
            value={values.capacity ?? ""}
            onChange={(event) =>
              set("capacity", event.target.value === "" ? undefined : Number(event.target.value))
            }
          />
        </Field>
        <Field label="Description" htmlFor="event-description">
          <Textarea
            id="event-description"
            rows={4}
            placeholder="What should residents know about this event?"
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Create Event"}
        </Button>
      </div>
    </form>
  );
}
