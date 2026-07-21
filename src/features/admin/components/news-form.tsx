"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, NewsArticleValues, NewsCategoryRow, GalleryPhoto } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  archiveNewsArticle,
  publishNewsArticle,
  returnNewsToDraft,
  saveNewsArticle,
  submitNewsForReview,
} from "@/features/admin/actions/news";
import { NewsPhotoUploader } from "./news-photo-uploader";

export interface NewsEditRecord {
  id: string;
  values: NewsArticleValues;
  status: ContentStatus;
  photos: GalleryPhoto[];
}

interface NewsFormProps {
  record: NewsEditRecord | null;
  categories: NewsCategoryRow[];
  /** `keepOpen` is true right after a brand-new post is first saved, so the drawer
   * stays open and reveals the photo uploader instead of closing on the user. */
  onSaved: (message: string, keepOpen?: boolean) => void;
  onCancel: () => void;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EMPTY_VALUES: NewsArticleValues = {
  title: "",
  slug: "",
  categoryId: "",
  excerpt: "",
  body: "",
};

/** Create/edit form for a news article. Saves via `saveNewsArticle`; workflow buttons drive status transitions. */
export function NewsForm({ record, categories, onSaved, onCancel }: NewsFormProps) {
  const [id, setId] = useState<string | null>(record?.id ?? null);
  const [status, setStatus] = useState<ContentStatus>(record?.status ?? "draft");
  const [values, setValues] = useState<NewsArticleValues>(() => {
    if (record) return record.values;
    const firstActive = categories.find((c) => c.isActive);
    return { ...EMPTY_VALUES, categoryId: firstActive?.id ?? "" };
  });
  // NewsPhotoUploader owns photo state internally after mount; this is only its seed.
  const photos = record?.photos ?? [];
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Active categories only for new posts; editing keeps the current category
  // selectable even if it has since been retired.
  const categoryOptions = categories.filter(
    (c) => c.isActive || c.id === record?.values.categoryId,
  );

  const set = <K extends keyof NewsArticleValues>(key: K, value: NewsArticleValues[K]) =>
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
      const result = await saveNewsArticle(id, values);
      if (result.error) {
        setError(result.error);
        return;
      }
      const wasNew = id === null;
      if (result.id) setId(result.id);
      onSaved(wasNew ? "Draft saved." : "Post updated.", wasNew);
    });
  }

  function runTransition(
    action: (articleId: string) => Promise<{ error: string | null }>,
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
        <Field label="Title" htmlFor="news-title">
          <Input
            id="news-title"
            value={values.title}
            onChange={(event) => handleTitleChange(event.target.value)}
            required
            minLength={3}
          />
        </Field>
        <Field label="Slug" htmlFor="news-slug">
          <Input
            id="news-slug"
            value={values.slug}
            onChange={(event) => set("slug", event.target.value)}
            disabled={status === "published"}
            required
          />
          {status === "published" ? (
            <p className="text-xs text-ink-500">The slug is locked once a post is published.</p>
          ) : null}
        </Field>
        <Field label="Category" htmlFor="news-category">
          <Select
            id="news-category"
            value={values.categoryId}
            onChange={(event) => set("categoryId", event.target.value)}
          >
            {categoryOptions.length === 0 ? <option value="">No categories available</option> : null}
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
                {category.isActive ? "" : " (retired)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Excerpt" htmlFor="news-excerpt">
          <Textarea
            id="news-excerpt"
            rows={3}
            value={values.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
          />
        </Field>
        <Field label="Body" htmlFor="news-body">
          <Textarea
            id="news-body"
            rows={8}
            placeholder="Write the full post content…"
            value={values.body}
            onChange={(event) => set("body", event.target.value)}
          />
        </Field>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink-700">Photos</h3>
          {id ? (
            <NewsPhotoUploader articleId={id} photos={photos} />
          ) : (
            <p className="rounded-2xl border border-dashed border-ink-200 p-4 text-sm text-ink-500">
              Save this post as a draft first, then come back to add up to 3 photos.
            </p>
          )}
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
                onClick={() => runTransition(submitNewsForReview, "in-review", "Submitted for review.")}
              >
                Submit for review
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={pending}
                onClick={() => runTransition(publishNewsArticle, "published", "Published.")}
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
                onClick={() => runTransition(publishNewsArticle, "published", "Published.")}
              >
                Publish
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => runTransition(returnNewsToDraft, "draft", "Returned to draft.")}
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
              onClick={() => runTransition(archiveNewsArticle, "archived", "Archived.")}
            >
              Archive
            </Button>
          ) : null}
          {id && status === "archived" ? (
            <Button
              type="button"
              variant="accent"
              disabled={pending}
              onClick={() => runTransition(publishNewsArticle, "published", "Published.")}
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
