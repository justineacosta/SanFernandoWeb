"use client";

import { useState } from "react";
import type { AdminNewsRecord, NewsPostFormValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

const NEWS_CATEGORIES = [
  "Governance",
  "Environment",
  "Health & Wellness",
  "Public Health",
  "Events",
  "Advisory",
  "Infrastructure",
];

interface NewsFormProps {
  record: AdminNewsRecord | null;
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit form for a news post or announcement. Validates, then fake-saves. */
export function NewsForm({ record, onSaved, onCancel }: NewsFormProps) {
  const [values, setValues] = useState<NewsPostFormValues>({
    title: record?.article.title ?? "",
    category: record?.article.category ?? NEWS_CATEGORIES[0],
    excerpt: record?.article.excerpt ?? "",
    body: "",
    status: record?.status ?? "draft",
    scheduledFor: record?.scheduledFor ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof NewsPostFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof NewsPostFormValues>(key: K, value: NewsPostFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!values.title.trim()) nextErrors.title = "Title is required.";
    if (values.status !== "draft" && !values.excerpt.trim())
      nextErrors.excerpt = "An excerpt is required before publishing.";
    if (values.status === "scheduled" && !values.scheduledFor)
      nextErrors.scheduledFor = "Pick a publish date and time.";
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
        <Field label="Title" htmlFor="news-title">
          <Input
            id="news-title"
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
          />
          {errors.title ? <p className="text-sm text-danger">{errors.title}</p> : null}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="news-category">
            <Select
              id="news-category"
              value={values.category}
              onChange={(event) => set("category", event.target.value)}
            >
              {NEWS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="news-status">
            <Select
              id="news-status"
              value={values.status}
              onChange={(event) =>
                set("status", event.target.value as NewsPostFormValues["status"])
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
            </Select>
          </Field>
        </div>
        {values.status === "scheduled" ? (
          <Field label="Publish On" htmlFor="news-scheduled-for">
            <Input
              id="news-scheduled-for"
              type="datetime-local"
              value={values.scheduledFor}
              onChange={(event) => set("scheduledFor", event.target.value)}
              aria-invalid={Boolean(errors.scheduledFor)}
            />
            {errors.scheduledFor ? (
              <p className="text-sm text-danger">{errors.scheduledFor}</p>
            ) : null}
          </Field>
        ) : null}
        <Field label="Excerpt" htmlFor="news-excerpt">
          <Textarea
            id="news-excerpt"
            rows={3}
            value={values.excerpt}
            onChange={(event) => set("excerpt", event.target.value)}
            aria-invalid={Boolean(errors.excerpt)}
          />
          {errors.excerpt ? <p className="text-sm text-danger">{errors.excerpt}</p> : null}
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
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : record ? "Save Changes" : "Create Post"}
        </Button>
      </div>
    </form>
  );
}
