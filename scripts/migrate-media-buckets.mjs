// One-time data migration: after applying 0028_media_buckets.sql, copy every
// existing object out of the old public-media/public-documents buckets into
// the correct new per-type bucket — the PUBLIC one if the owning record is
// currently `published`, the PRIVATE `-drafts` one otherwise.
//
// Run ONCE PER ENVIRONMENT, after 0028 has been applied:
//   node scripts/migrate-media-buckets.mjs
//
// Read-only against the database and additive against Storage (upsert:
// true) — it only copies, it never deletes anything from public-media or
// public-documents. Deleting the two old buckets is a separate, manual step
// you take later, once you've confirmed the new buckets look right.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isRemote = (path) => /^https?:\/\//i.test(path ?? "");

/** Copy one object from `sourceBucket` to `destBucket` at the same path. */
async function copyObject(sourceBucket, destBucket, path) {
  const { data: file, error: downloadErr } = await supabase.storage.from(sourceBucket).download(path);
  if (downloadErr || !file) return { error: `download ${sourceBucket}/${path}: ${downloadErr?.message ?? "not found"}` };
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(destBucket)
    .upload(path, buffer, { contentType: file.type || undefined, upsert: true });
  if (uploadErr) return { error: `upload ${destBucket}/${path}: ${uploadErr.message}` };
  return { error: null };
}

let ok = 0;
let failed = 0;

/** Copy one path, given the owning record's current status. Skips remote seed URLs. */
async function migrateOne(kind, status, path) {
  if (isRemote(path)) return;
  const destBucket = status === "published" ? `${kind}-media` : `${kind}-drafts`;
  const { error } = await copyObject("public-media", destBucket, path);
  if (error) {
    console.error(`FAIL [${kind}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

/** Same as migrateOne, but the source is public-documents, not public-media. */
async function migrateOneDocument(kind, status, path) {
  if (isRemote(path)) return;
  const destBucket = status === "published" ? `${kind}-media` : `${kind}-drafts`;
  const { error } = await copyObject("public-documents", destBucket, path);
  if (error) {
    console.error(`FAIL [${kind}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

/** Always-public content (no status split): copy straight to its one bucket. */
async function migrateAlwaysPublic(bucket, path) {
  if (isRemote(path)) return;
  const { error } = await copyObject("public-media", bucket, path);
  if (error) {
    console.error(`FAIL [${bucket}] ${path}: ${error}`);
    failed += 1;
  } else {
    ok += 1;
  }
}

console.log("Migrating news articles' photos...");
{
  const { data: photos, error } = await supabase
    .from("news_photos")
    .select("src, news_articles!inner(status)");
  if (error) throw error;
  for (const row of photos ?? []) {
    await migrateOne("news", row.news_articles.status, row.src);
  }
}

console.log("Migrating officials' portraits...");
{
  const { data: officials, error } = await supabase.from("officials").select("status, photo_path");
  if (error) throw error;
  for (const row of officials ?? []) {
    if (row.photo_path) await migrateOne("officials", row.status, row.photo_path);
  }
}

console.log("Migrating officials' achievement photos...");
{
  const { data: photos, error } = await supabase
    .from("official_achievement_photos")
    .select("src, official_achievements!inner(officials!inner(status))");
  if (error) throw error;
  for (const row of photos ?? []) {
    const status = row.official_achievements.officials.status;
    await migrateOne("officials", status, row.src);
  }
}

console.log("Migrating event covers...");
{
  const { data: events, error } = await supabase.from("events").select("status, cover_src");
  if (error) throw error;
  for (const row of events ?? []) {
    if (row.cover_src) await migrateOne("events", row.status, row.cover_src);
  }
}

console.log("Migrating announcement images...");
{
  const { data: rows, error } = await supabase.from("announcements").select("status, image_src");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.image_src) await migrateOne("announcements", row.status, row.image_src);
  }
}

console.log("Migrating legislative document PDFs...");
{
  const { data: rows, error } = await supabase.from("legislative_documents").select("status, file_path");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.file_path) await migrateOneDocument("legislative", row.status, row.file_path);
  }
}

console.log("Migrating transparency documents' files...");
{
  const { data: rows, error } = await supabase
    .from("transparency_files")
    .select("path, owner_type, owner_id");
  if (error) throw error;
  const documentRows = (rows ?? []).filter((r) => r.owner_type === "document");
  const projectRows = (rows ?? []).filter((r) => r.owner_type === "project");

  const docIds = [...new Set(documentRows.map((r) => r.owner_id))];
  const projectIds = [...new Set(projectRows.map((r) => r.owner_id))];

  const docStatus = new Map();
  if (docIds.length > 0) {
    const { data, error: e } = await supabase.from("transparency_documents").select("id, status").in("id", docIds);
    if (e) throw e;
    for (const d of data ?? []) docStatus.set(d.id, d.status);
  }
  const projectStatus = new Map();
  if (projectIds.length > 0) {
    const { data, error: e } = await supabase.from("transparency_projects").select("id, status").in("id", projectIds);
    if (e) throw e;
    for (const p of data ?? []) projectStatus.set(p.id, p.status);
  }

  for (const row of documentRows) {
    const status = docStatus.get(row.owner_id);
    if (status) await migrateOneDocument("transparency", status, row.path);
  }
  for (const row of projectRows) {
    const status = projectStatus.get(row.owner_id);
    if (status) await migrateOneDocument("transparency", status, row.path);
  }
}

console.log("Migrating site content images...");
{
  const { data: blocks, error: e1 } = await supabase.from("site_blocks").select("value");
  if (e1) throw e1;
  for (const row of blocks ?? []) {
    if (row.value && /^site\//.test(row.value)) await migrateAlwaysPublic("site-media", row.value);
  }
  const { data: items, error: e2 } = await supabase.from("site_items").select("image_path");
  if (e2) throw e2;
  for (const row of items ?? []) {
    if (row.image_path) await migrateAlwaysPublic("site-media", row.image_path);
  }
}

console.log("Migrating staff avatars...");
{
  const { data: rows, error } = await supabase.from("profiles").select("avatar_src");
  if (error) throw error;
  for (const row of rows ?? []) {
    if (row.avatar_src) await migrateAlwaysPublic("avatars-media", row.avatar_src);
  }
}

console.log(`\n${ok} object(s) copied, ${failed} failed.`);
console.log(
  failed === 0
    ? "\nAll objects copied. Verify a sample of them in the Supabase dashboard, then delete public-media and public-documents by hand once satisfied."
    : "\nSome objects failed to copy — see FAIL lines above. Do not delete the old buckets until every failure is resolved and re-run.",
);
process.exit(failed === 0 ? 0 : 1);
