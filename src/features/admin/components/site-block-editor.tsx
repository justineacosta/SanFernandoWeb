"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SiteBlockKey } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useFormDraft } from "@/hooks/use-form-draft";
import { SITE_MEDIA_BUCKET, mediaUrl } from "@/lib/storage";
import { saveSiteBlock } from "@/features/admin/actions/site-content";
import type { SiteSingletonSpec } from "@/features/admin/site-blocks";
import { useAdminUserId } from "./admin-user-context";
import { DraftRecoveryBar, DraftSavedNote } from "./draft-recovery-bar";
import { SingleImageUploader } from "./single-image-uploader";

interface SiteBlockEditorProps {
  spec: SiteSingletonSpec;
  value: string | null;
}

/**
 * A singleton block — mission, vision, the captain's message, the banner image.
 *
 * Edited in place rather than in a drawer: there is exactly one of each, so a
 * list to pick from would have a single row, and the drawer would exist only to
 * be closed. Save writes live (design §2.3); the autosave copy stays in the
 * browser, as everywhere else.
 */
export function SiteBlockEditor({ spec, value }: SiteBlockEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState({ text: value ?? "" });
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { toast, showToast, showError, dismissToast } = useToast();

  const draft = useFormDraft(useAdminUserId(), "site-block", spec.key, values);

  const dirty = values.text !== (value ?? "") || image !== null || removeImage;

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      if (image) fd.append("image", image);
      if (removeImage) fd.append("removeImage", "1");
      // A blanked text block stores null, not "" — mission and vision are
      // meant to be clearable, and the public page hides an absent card.
      const next = spec.kind === "image" ? values.text : values.text.trim() || null;
      const result = await saveSiteBlock(spec.key as SiteBlockKey, next, fd);
      if (result.error) {
        setError(result.error);
        showError(result.error);
        return;
      }
      draft.clear();
      setImage(null);
      setRemoveImage(false);
      showToast(`${spec.title} saved.`);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="p-6">
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-900">
              {spec.title}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{spec.description}</p>
          </div>

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

          {spec.kind === "image" ? (
            <SingleImageUploader
              idPrefix={`block-${spec.key}`}
              existingSrc={value}
              existingPreviewUrl={value ? mediaUrl(SITE_MEDIA_BUCKET, value) : null}
              alt=""
              onAltChange={() => {}}
              file={image}
              onFileChange={setImage}
              removeExisting={removeImage}
              onRemoveExistingChange={setRemoveImage}
              decorative
            />
          ) : (
            <Field label={spec.title} htmlFor={`block-${spec.key}`}>
              <Textarea
                id={`block-${spec.key}`}
                rows={spec.rows ?? 6}
                value={values.text}
                onChange={(event) => setValues({ text: event.target.value })}
              />
            </Field>
          )}

          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-3">
            <DraftSavedNote savedAt={draft.savedAt} />
            <Button type="submit" size="sm" className="ml-auto" disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
