"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { NewsArticleValues, SessionUser } from "@/types";
import { requirePermission } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}
export interface SaveResult {
  error: string | null;
  id: string | null;
}

const schema = z.object({
  title: z.string().trim().min(3, "Enter a title."),
  slug: z.string().trim().min(1, "Enter a slug."),
  categoryId: z.string().trim().min(1, "Pick a category."),
  excerpt: z.string().trim().min(1, "Enter an excerpt."),
  body: z.string(),
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function revalidate() {
  revalidatePath("/admin/news");
  revalidatePath("/announcements");
  revalidatePath("/");
}

/** Ensure a slug is unique, suffixing -2, -3… (ignoring the row being edited). */
async function uniqueSlug(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  base: string,
  ignoreId: string | null,
): Promise<string> {
  const { data } = await admin.from("news_articles").select("id, slug");
  const taken = new Set((data ?? []).filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function saveNewsArticle(
  id: string | null,
  values: NewsArticleValues,
): Promise<SaveResult> {
  const actor = await requirePermission("manage-news");
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid values.", id: null };

  const admin = createSupabaseAdminClient();

  // category must exist — never trust categoryId from the client.
  const { data: cat } = await admin
    .from("news_categories")
    .select("id")
    .eq("id", parsed.data.categoryId)
    .maybeSingle();
  if (!cat) return { error: "Pick a valid category.", id: null };

  if (id) {
    // Editing: lock the slug once published.
    const { data: existing, error: readErr } = await admin
      .from("news_articles")
      .select("status, slug")
      .eq("id", id)
      .maybeSingle();
    if (readErr) return { error: "Could not save the article.", id: null };
    if (!existing) return { error: "Article not found.", id: null };
    const slug =
      existing.status === "published"
        ? existing.slug
        : await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), id);
    const { error } = await admin
      .from("news_articles")
      .update({
        title: parsed.data.title,
        slug,
        category_id: parsed.data.categoryId,
        excerpt: parsed.data.excerpt,
        body: parsed.data.body,
      })
      .eq("id", id);
    if (error) return { error: "Could not save the article.", id: null };
    await recordActivity(actor, "updated news article", "news article", id, parsed.data.title);
    revalidate();
    return { error: null, id };
  }

  const slug = await uniqueSlug(admin, slugify(parsed.data.slug) || slugify(parsed.data.title), null);
  const { data: inserted, error } = await admin
    .from("news_articles")
    .insert({
      title: parsed.data.title,
      slug,
      category_id: parsed.data.categoryId,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      author_id: actor.id,
      author_name: actor.fullName,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !inserted) return { error: "Could not create the article.", id: null };
  await recordActivity(actor, "created news article", "news article", inserted.id, parsed.data.title);
  revalidate();
  return { error: null, id: inserted.id };
}

/**
 * Apply a status transition. The `from` set is enforced inside the UPDATE's
 * WHERE (not a read-then-write) so a concurrent transition can't race past
 * this check. `actor` is resolved by the caller so that every exported
 * action's own first statement is the `requirePermission` gate.
 */
async function applyTransition(
  actor: SessionUser,
  id: string,
  from: string[],
  patch: Record<string, unknown>,
  verb: string,
): Promise<ActionResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", from)
    .select("id, title")
    .maybeSingle();
  if (error) return { error: "Could not update the article." };
  if (!data) return { error: "This article is no longer in a state that allows that action." };
  await recordActivity(actor, verb, "news article", id, data.title);
  revalidate();
  return { error: null };
}

export async function submitNewsForReview(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(actor, id, ["draft"], { status: "in-review" }, "submitted news article for review");
}

export async function returnNewsToDraft(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(actor, id, ["in-review"], { status: "draft" }, "returned news article to draft");
}

export async function archiveNewsArticle(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  return applyTransition(
    actor,
    id,
    ["draft", "in-review", "published"],
    { status: "archived" },
    "archived news article",
  );
}

/** Publish; set published_at only on first publish so re-publishing an archived article doesn't bump it. */
export async function publishNewsArticle(id: string): Promise<ActionResult> {
  const actor = await requirePermission("manage-news");
  const admin = createSupabaseAdminClient();
  const { data: row, error: readErr } = await admin
    .from("news_articles")
    .select("published_at, title, excerpt")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: "Could not publish the article." };
  if (!row) return { error: "Article not found." };
  if (!row.excerpt?.trim()) return { error: "Add an excerpt before publishing." };
  const patch: Record<string, unknown> = { status: "published" };
  if (!row.published_at) patch.published_at = new Date().toISOString();
  const { data, error } = await admin
    .from("news_articles")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "in-review", "archived"])
    .select("id")
    .maybeSingle();
  if (error) return { error: "Could not publish the article." };
  if (!data) return { error: "This article is already published." };
  await recordActivity(actor, "published news article", "news article", id, row.title);
  revalidate();
  return { error: null };
}
