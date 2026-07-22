"use client";

import { useState, useTransition } from "react";
import type { AdminAchievement, ContentStatus, OfficialValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveOfficial, setOfficialStatus } from "@/features/admin/actions/officials";
import { AchievementsEditor } from "./achievements-editor";
import { SingleImageUploader } from "./single-image-uploader";

export interface OfficialEditRecord {
  id: string;
  values: OfficialValues;
  status: ContentStatus;
  photoUrl: string | null;
  achievements: AdminAchievement[];
}

interface OfficialFormProps {
  record: OfficialEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: OfficialValues = {
  name: "",
  role: "",
  group: "council",
  badge: null,
  photoPath: null,
  photoAlt: "",
  term: "2023-2026",
  email: null,
  phone: null,
  bio: "",
};

/** Create/edit form for one barangay official. */
export function OfficialForm({ record, onSaved, onCancel }: OfficialFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<OfficialValues>(record?.values ?? EMPTY_VALUES);
  const [previewUrl, setPreviewUrl] = useState<string | null>(record?.photoUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof OfficialValues>(key: K, value: OfficialValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveOfficial(id, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      onSaved("Official saved.");
    });
  }

  /**
   * Publish must persist the on-screen values first: `setOfficialStatus`
   * reads `photo_path`/`photo_alt` from the database, so an uploaded portrait
   * that was never Saved would otherwise fail the server's portrait check
   * even though it's visibly on screen. Reuses the `saveOfficial` path (which
   * also handles the brand-new, no-id-yet case) and only transitions status
   * once that save has actually succeeded.
   */
  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const saveResult = await saveOfficial(id, values);
      if (saveResult.error) {
        setError(saveResult.error);
        return;
      }
      const officialId = saveResult.id ?? id;
      if (saveResult.id) setId(saveResult.id);
      if (!officialId) {
        setError("Could not save the official.");
        return;
      }
      const statusResult = await setOfficialStatus(officialId, "published");
      if (statusResult.error) {
        setError(statusResult.error);
        return;
      }
      setStatus("published");
      onSaved("Published.");
    });
  }

  return (
    <form onSubmit={handleSave} noValidate className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <Field label="Full Name" htmlFor="official-name">
          <Input
            id="official-name"
            placeholder="e.g. Hon. Juan D. Santos"
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Position" htmlFor="official-role">
          <Input
            id="official-role"
            placeholder="e.g. Barangay Kagawad"
            value={values.role}
            onChange={(event) => set("role", event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Directory Section" htmlFor="official-group">
          <Select
            id="official-group"
            value={values.group}
            onChange={(event) => set("group", event.target.value as OfficialValues["group"])}
          >
            <option value="executive">Chief Executive</option>
            <option value="council">Barangay Council</option>
            <option value="administration">Administration</option>
          </Select>
        </Field>
        <Field label="Badge (optional)" htmlFor="official-badge">
          <Input
            id="official-badge"
            placeholder="e.g. Youth Leader"
            value={values.badge ?? ""}
            onChange={(event) => set("badge", event.target.value)}
          />
          <p className="text-xs text-ink-500">
            Shown as a pill on the directory card and highlights the card.
          </p>
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Portrait</h3>
          <SingleImageUploader
            folder="officials"
            src={values.photoPath}
            alt={values.photoAlt}
            previewUrl={previewUrl}
            onChange={(next) => {
              set("photoPath", next.src);
              set("photoAlt", next.alt);
              setPreviewUrl(next.previewUrl);
            }}
          />
          <p className="mt-2 text-xs text-ink-500">
            Square photos look best — the card crops to a square. Required before publishing.
          </p>
        </div>
        <Field label="Term" htmlFor="official-term">
          <Input
            id="official-term"
            placeholder="e.g. 2023-2026"
            value={values.term}
            onChange={(event) => set("term", event.target.value)}
          />
        </Field>
        <Field label="Email (optional)" htmlFor="official-email">
          <Input
            id="official-email"
            type="email"
            value={values.email ?? ""}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>
        <Field label="Phone (optional)" htmlFor="official-phone">
          <Input
            id="official-phone"
            value={values.phone ?? ""}
            onChange={(event) => set("phone", event.target.value)}
          />
        </Field>
        <Field label="Short Bio" htmlFor="official-bio">
          <Textarea
            id="official-bio"
            rows={5}
            value={values.bio}
            onChange={(event) => set("bio", event.target.value)}
          />
          <p className="text-xs text-ink-500">
            Appears on the official&rsquo;s profile page. Leave blank to hide that section.
          </p>
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Achievements</h3>
          {id ? (
            <AchievementsEditor
              key={id}
              officialId={id}
              achievements={record?.achievements ?? []}
            />
          ) : (
            <p className="rounded-2xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
              Save the official first to add achievements.
            </p>
          )}
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {/*
        Archive and Delete moved to the row's actions menu (sub-project 5): a
        destructive action should not require opening an editor you did not
        want to open. Publish stays here because it must persist the on-screen
        values first — see handlePublish.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200/70 p-6">
        <div className="flex flex-wrap gap-2">
          {id && status !== "published" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={handlePublish}
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
            {pending ? "Saving…" : id ? "Save Changes" : "Add Official"}
          </Button>
        </div>
      </div>
    </form>
  );
}
