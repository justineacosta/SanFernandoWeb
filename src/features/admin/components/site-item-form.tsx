"use client";

import { useState, useTransition } from "react";
import type { SiteBlock, SiteItemValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { SITE_ICON_OPTIONS } from "@/lib/icon-map";
import { useFormDraft } from "@/hooks/use-form-draft";
import { saveSiteItem } from "@/features/admin/actions/site-content";
import { specFor, type SiteBlockField } from "@/features/admin/site-blocks";
import { useAdminUserId } from "./admin-user-context";
import { DraftRecoveryBar, DraftSavedNote } from "./draft-recovery-bar";
import { SingleImageUploader } from "./single-image-uploader";

export interface SiteItemEditRecord {
  id: string;
  values: SiteItemValues;
  /** Stored reference (path or seed URL), for the uploader's "already there" state. */
  imagePath: string | null;
  imageUrl: string | null;
}

interface SiteItemFormProps {
  block: SiteBlock;
  record: SiteItemEditRecord | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const EMPTY_VALUES: SiteItemValues = {
  iconName: null,
  label: null,
  value: null,
  body: null,
  href: null,
  imageAlt: null,
  imageFit: null,
};

/**
 * One item in one collection. The field set comes from `SITE_BLOCK_SPECS`
 * rather than from a switch here, so a block's shape is stated once (see
 * site-blocks.ts) instead of drifting between the form, the list and the
 * validator.
 */
export function SiteItemForm({ block, record, onSaved, onCancel }: SiteItemFormProps) {
  const spec = specFor(block);
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [values, setValues] = useState<SiteItemValues>(
    record?.values ?? {
      ...EMPTY_VALUES,
      // The timeline frames a seal differently from a photograph, so the choice
      // is offered — but "cover" is right for almost every image.
      imageFit: spec.image?.fit ? "cover" : null,
    },
  );
  // Files are state, never part of `values`: that is what keeps the recovery
  // snapshot text-only by construction (sub-projects 7 and 8).
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // New items key on the block, so an unsaved new slide is offered back in the
  // carousel drawer and not in the timeline's.
  const draft = useFormDraft(useAdminUserId(), "site-item", id ?? `new-${block}`, values);

  const set = <K extends keyof SiteItemValues>(key: K, value: SiteItemValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function imageForm(): FormData {
    const fd = new FormData();
    if (image) fd.append("image", image);
    if (removeImage) fd.append("removeImage", "1");
    return fd;
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveSiteItem(id, block, values, imageForm());
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.id) setId(result.id);
      draft.clear();
      onSaved(`${cap(spec.itemNoun)} saved.`);
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

        {spec.fields.map((field) => (
          <ItemField
            key={field.key}
            field={field}
            block={block}
            value={values[field.key]}
            onChange={(next) => set(field.key, next as SiteItemValues[typeof field.key])}
          />
        ))}

        {spec.image ? (
          <>
            <SingleImageUploader
              idPrefix={`site-${block}`}
              existingSrc={record?.imagePath ?? null}
              existingPreviewUrl={record?.imageUrl ?? null}
              alt={values.imageAlt ?? ""}
              onAltChange={(alt) => set("imageAlt", alt)}
              file={image}
              onFileChange={setImage}
              removeExisting={removeImage}
              onRemoveExistingChange={setRemoveImage}
            />
            {spec.image.fit ? (
              <Field
                label="Image fit"
                htmlFor={`site-${block}-fit`}
                hint="“Fill the frame” crops to fill. “Fit inside” suits a seal or logo that must not be cut off."
              >
                <Select
                  id={`site-${block}-fit`}
                  value={values.imageFit ?? "cover"}
                  onChange={(event) =>
                    set("imageFit", event.target.value === "contain" ? "contain" : "cover")
                  }
                >
                  <option value="cover">Fill the frame</option>
                  <option value="contain">Fit inside the frame</option>
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-ink-200/70 p-6">
        <DraftSavedNote savedAt={draft.savedAt} />
        <div className="ml-auto flex gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : id ? "Save Changes" : `Add ${cap(spec.itemNoun)}`}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ItemField({
  field,
  block,
  value,
  onChange,
}: {
  field: SiteBlockField;
  block: SiteBlock;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = `site-${block}-${field.key}`;
  // An emptied optional field is stored as null, not "": the column is nullable
  // and the CHECK constraint reads null, so "" would be a second way to spell
  // "absent" that only this form knows about.
  const handle = (next: string) => onChange(next.length > 0 ? next : null);

  return (
    <Field label={field.label} htmlFor={id} hint={field.hint}>
      {field.type === "icon" ? (
        <Select id={id} value={value ?? ""} onChange={(event) => handle(event.target.value)}>
          <option value="">Choose an icon…</option>
          {SITE_ICON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea id={id} rows={4} value={value ?? ""} onChange={(event) => handle(event.target.value)} />
      ) : (
        <Input
          id={id}
          type="text"
          inputMode={field.type === "href" ? "url" : undefined}
          placeholder={field.type === "href" ? "/services" : undefined}
          value={value ?? ""}
          onChange={(event) => handle(event.target.value)}
        />
      )}
    </Field>
  );
}

function cap(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
