"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, EventValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { photoUrl } from "@/lib/storage";
import { EVENT_CATEGORY_LABELS } from "@/features/admin/data";
import {
  archiveEvent,
  publishEvent,
  returnEventToDraft,
  saveEvent,
  submitEventForReview,
} from "@/features/admin/actions/events";
import { SingleImageUploader } from "./single-image-uploader";

export interface EventEditRecord {
  id: string;
  values: EventValues;
  status: ContentStatus;
}

interface EventFormProps {
  record: EventEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: EventValues = {
  title: "",
  category: "community",
  eventDate: "",
  startTime: "",
  endTime: "",
  venue: "",
  capacity: null,
  description: "",
  coverSrc: null,
  coverAlt: "",
};

/** Create/edit drawer for a community event. Saves via `saveEvent`; workflow buttons drive status transitions. */
export function EventForm({ record, onSaved, onCancel }: EventFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<EventValues>(record?.values ?? EMPTY_VALUES);
  // Held, not uploaded — see single-image-uploader.tsx and saveEvent.
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof EventValues>(key: K, value: EventValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (cover) fd.append("image", cover);
      if (removeCover) fd.append("removeImage", "1");
      const result = await saveEvent(id, values, fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      const wasNew = id === null;
      if (result.id) setId(result.id);
      onSaved(wasNew ? "Draft saved." : "Event updated.");
    });
  }

  function runTransition(
    action: (eventId: string) => Promise<{ error: string | null }>,
    nextStatus: ContentStatus,
    message: string,
  ) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      const result = await action(currentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStatus(nextStatus);
      onSaved(message);
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Event Title" htmlFor="event-title">
          <Input
            id="event-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="event-category">
            <Select
              id="event-category"
              value={values.category}
              onChange={(event) => set("category", event.target.value as EventValues["category"])}
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
              value={values.eventDate}
              onChange={(event) => set("eventDate", event.target.value)}
              required
            />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Start Time" htmlFor="event-start">
            <Input
              id="event-start"
              placeholder="8:00 AM"
              value={values.startTime}
              onChange={(event) => set("startTime", event.target.value)}
              required
            />
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
            required
          />
        </Field>
        <Field label="Capacity (optional)" htmlFor="event-capacity">
          <Input
            id="event-capacity"
            type="number"
            min={1}
            value={values.capacity ?? ""}
            onChange={(event) => set("capacity", event.target.value === "" ? null : Number(event.target.value))}
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
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Cover Image</h3>
          <SingleImageUploader
            idPrefix="event"
            existingSrc={values.coverSrc}
            existingPreviewUrl={values.coverSrc ? photoUrl(values.coverSrc) : null}
            alt={values.coverAlt}
            onAltChange={(next) => set("coverAlt", next)}
            file={cover}
            onFileChange={setCover}
            removeExisting={removeCover}
            onRemoveExistingChange={setRemoveCover}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 p-6">
        <div className="flex flex-wrap gap-2">
          {id && status === "draft" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(submitEventForReview, "in-review", "Submitted for review.")}
              >
                Submit for review
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition(publishEvent, "published", "Published.")}
              >
                Publish
              </Button>
            </>
          ) : null}
          {id && status === "in-review" ? (
            <>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition(publishEvent, "published", "Published.")}
              >
                Publish
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(returnEventToDraft, "draft", "Returned to draft.")}
              >
                Return to draft
              </Button>
            </>
          ) : null}
          {id && status === "published" ? (
            <Button
              type="button"
              variant="outline-danger"
              disabled={pending}
              onClick={() => runTransition(archiveEvent, "archived", "Archived.")}
            >
              Archive
            </Button>
          ) : null}
          {id && status === "archived" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={() => runTransition(publishEvent, "published", "Published.")}
            >
              Publish
            </Button>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : id ? "Save Changes" : "Save Draft"}
          </Button>
        </div>
      </div>
    </form>
  );
}
