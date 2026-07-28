"use client";

import { useState, useTransition } from "react";
import type { AnnouncementValues, ContentStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useAdminUserId } from "./admin-user-context";
import { DraftRecoveryBar, DraftSavedNote } from "./draft-recovery-bar";
import {
  archiveAnnouncement,
  publishAnnouncement,
  returnAnnouncementToDraft,
  saveAnnouncement,
  submitAnnouncementForReview,
} from "@/features/admin/actions/announcements";
import { SingleImageUploader } from "./single-image-uploader";

export interface AnnouncementEditRecord {
  id: string;
  values: AnnouncementValues;
  status: ContentStatus;
  imagePreviewUrl: string | null;
}

interface AnnouncementFormProps {
  record: AnnouncementEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_VALUES: AnnouncementValues = {
  title: "",
  slug: "",
  date: "",
  excerpt: "",
  body: "",
  urgent: false,
  imageSrc: null,
  imageAlt: "",
};

/** Create/edit drawer for an announcement. Saves via `saveAnnouncement`; workflow buttons drive status transitions. */
export function AnnouncementForm({ record, onSaved, onCancel }: AnnouncementFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<AnnouncementValues>(record?.values ?? EMPTY_VALUES);
  // The chosen image is held here, not uploaded: see single-image-uploader.tsx
  // and saveAnnouncement for why nothing touches storage until Save runs.
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draft = useFormDraft(useAdminUserId(), "announcement", id, values);

  const set = <K extends keyof AnnouncementValues>(key: K, value: AnnouncementValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleTitleChange(next: string) {
    setValues((prev) => ({
      ...prev,
      title: next,
      slug: prev.slug.trim() === "" ? slugify(next) : prev.slug,
    }));
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        if (image) fd.append("image", image);
        if (removeImage) fd.append("removeImage", "1");
        const result = await saveAnnouncement(id, values, fd);
        if (result.error) {
          setError(result.error);
          return;
        }
        const wasNew = id === null;
        if (result.id) setId(result.id);
        // The work is on the server: drop the recovery copy and re-baseline, so
        // the autosave effect does not immediately write it back.
        draft.clear();
        onSaved(wasNew ? "Draft saved." : "Announcement updated.");
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  function runTransition(
    action: (announcementId: string) => Promise<{ error: string | null }>,
    nextStatus: ContentStatus,
    message: string,
  ) {
    const currentId = id;
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(currentId);
        if (result.error) {
          setError(result.error);
          return;
        }
        setStatus(nextStatus);
        onSaved(message);
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {draft.recovered && draft.recoveredLabel ? (
          <DraftRecoveryBar
            savedAtLabel={draft.recoveredLabel}
            hasFileState={image !== null || removeImage}
            onRestore={() => {
              setValues(draft.recovered!.values);
              draft.dismiss();
            }}
            onDiscard={draft.discard}
          />
        ) : null}
        <Field label="Title" htmlFor="announcement-title">
          <Input
            id="announcement-title"
            value={values.title}
            onChange={(event) => handleTitleChange(event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Slug" htmlFor="announcement-slug">
          <Input
            id="announcement-slug"
            value={values.slug}
            onChange={(event) => set("slug", event.target.value)}
            disabled={status === "published"}
            required
          />
          {status === "published" ? (
            <p className="text-xs text-ink-500">The slug is locked once an announcement is published.</p>
          ) : null}
        </Field>
        <Field label="Date" htmlFor="announcement-date">
          <Input
            id="announcement-date"
            type="date"
            value={values.date}
            onChange={(event) => set("date", event.target.value)}
            required
          />
        </Field>
        <Field label="Excerpt" htmlFor="announcement-excerpt">
          <Textarea
            id="announcement-excerpt"
            rows={4}
            value={values.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
          />
        </Field>
        <Field label="Body" htmlFor="announcement-body">
          <Textarea
            id="announcement-body"
            rows={8}
            placeholder="Write the full notice text…"
            value={values.body}
            onChange={(event) => set("body", event.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink-700">
          <Checkbox
            checked={values.urgent}
            onChange={(event) => set("urgent", event.target.checked)}
            aria-label="Mark this announcement urgent"
          />
          Mark as urgent
        </label>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Image</h3>
          <SingleImageUploader
            idPrefix="announcement"
            existingSrc={values.imageSrc}
            existingPreviewUrl={record?.imagePreviewUrl ?? null}
            alt={values.imageAlt}
            onAltChange={(next) => set("imageAlt", next)}
            file={image}
            onFileChange={setImage}
            removeExisting={removeImage}
            onRemoveExistingChange={setRemoveImage}
          />
        </div>
        {error ? <InlineAlert message={error} onDismiss={() => setError(null)} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 p-6">
        <div className="flex flex-wrap gap-2">
          {id && status === "draft" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(submitAnnouncementForReview, "in-review", "Submitted for review.")}
              >
                Submit for review
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition(publishAnnouncement, "published", "Published.")}
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
                onClick={() => runTransition(publishAnnouncement, "published", "Published.")}
              >
                Publish
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(returnAnnouncementToDraft, "draft", "Returned to draft.")}
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
              onClick={() => runTransition(archiveAnnouncement, "archived", "Archived.")}
            >
              Archive
            </Button>
          ) : null}
          {id && status === "archived" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={() => runTransition(publishAnnouncement, "published", "Published.")}
            >
              Publish
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <DraftSavedNote savedAt={draft.savedAt} />
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
