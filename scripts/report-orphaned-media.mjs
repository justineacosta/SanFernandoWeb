// Report storage objects that no database row references (sub-project 7 §2.8).
//
//   node scripts/report-orphaned-media.mjs
//
// READ-ONLY. It lists and prints; it never deletes. That is deliberate: a
// sweeper acting on its own judgement is exactly the mechanism the umbrella
// spec rejected, and a bug in one would destroy live content silently. Decide
// from the list, delete by hand.
//
// Orphans exist because uploads used to happen on file-select: cancelling a
// drawer, or replacing an image, left the object behind. That path is closed
// for every save flow except the two-call PDF upload (security-hardening
// Plan 3 — a request that dies between a successful Route Handler upload and
// the save action committing leaves an object this script will catch).
//
// Rewritten for the media-bucket-split (2026-07-27, CLAUDE.md "Media buckets
// are split per content type"). There is no single shared `public-media`
// bucket with folder prefixes anymore — each status-aware content type has
// its own public/private bucket pair (`news-media`/`news-drafts`, etc — see
// MediaKind in src/lib/storage.ts), plus three single-bucket kinds with no
// draft/publish split (site-media, avatars-media, feedback-media). This
// mirrors that shape instead of a hardcoded BUCKET/FOLDERS list, which found
// nothing once the split shipped — the objects had all moved to buckets this
// script never looked at.
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
const supabase = createClient(url, key, { auth: { persistSession: false } });

// Mirrors publicBucketFor/draftBucketFor in src/lib/storage.ts — kept as a
// plain formula here rather than imported, since this script runs outside
// the Next/TS build.
const publicBucketFor = (kind) => `${kind}-media`;
const draftBucketFor = (kind) => `${kind}-drafts`;

// Every status-aware MediaKind, and each table.column that can hold one of
// its paths. A row's path is checked against both halves of its kind's
// bucket pair rather than just the bucket its current status implies —
// promote/demote already guarantee the right bucket (see CLAUDE.md), and
// checking both is the more defensive read for a script whose whole job is
// catching what that guarantee missed.
const STATUS_AWARE_SOURCES = {
  news: [["news_photos", "src"]],
  officials: [
    ["officials", "photo_path"],
    ["official_achievement_photos", "src"],
  ],
  events: [["events", "cover_src"]],
  announcements: [["announcements", "image_src"]],
  legislative: [["legislative_documents", "file_path"]],
  // transparency_files holds attachments for both transparency_documents and
  // transparency_projects (owner_type discriminates); both ride the one
  // "transparency" MediaKind bucket pair.
  transparency: [["transparency_files", "path"]],
};

// Kinds with exactly one bucket and no draft/publish split.
const SINGLE_BUCKETS = [
  { bucket: "site-media", table: "site_items", column: "image_path" },
  { bucket: "avatars-media", table: "profiles", column: "avatar_src" },
  { bucket: "feedback-media", table: "feedback", column: "screenshot_path" },
];

/** List a bucket recursively — storage.list() is one level at a time. */
async function listBucket(bucket, prefix = "") {
  const found = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder placeholder has no id; a real object always has one.
    if (entry.id === null) found.push(...(await listBucket(bucket, path)));
    else found.push(path);
  }
  return found;
}

/** Every path referenced across the given table.column pairs. */
async function referencedPaths(sources) {
  const referenced = new Set();
  const add = (value) => {
    // Seed rows keep their original remote URLs; those own no object here.
    if (typeof value === "string" && value && !/^https?:\/\//i.test(value)) {
      referenced.add(value);
    }
  };
  for (const [table, column] of sources) {
    const { data, error } = await supabase.from(table).select(column);
    if (error) throw new Error(`select ${table}.${column}: ${error.message}`);
    for (const row of data ?? []) add(row[column]);
  }
  return referenced;
}

function report(bucket, stored, referenced) {
  const orphans = stored.filter((path) => !referenced.has(path));
  console.log(`\nbucket           : ${bucket}`);
  console.log(`objects stored   : ${stored.length}`);
  console.log(`paths referenced : ${referenced.size}`);
  console.log(`orphans          : ${orphans.length}`);
  for (const path of orphans) console.log(`  ${path}`);
  return orphans.length;
}

let totalOrphans = 0;

for (const [kind, sources] of Object.entries(STATUS_AWARE_SOURCES)) {
  const referenced = await referencedPaths(sources);
  for (const bucket of [publicBucketFor(kind), draftBucketFor(kind)]) {
    const stored = await listBucket(bucket);
    totalOrphans += report(bucket, stored, referenced);
  }
}

for (const { bucket, table, column } of SINGLE_BUCKETS) {
  const referenced = await referencedPaths([[table, column]]);
  const stored = await listBucket(bucket);
  totalOrphans += report(bucket, stored, referenced);
}

console.log(`\ntotal orphans across all buckets: ${totalOrphans}`);
if (totalOrphans > 0) {
  console.log("Nothing was deleted. Review the list before removing anything.");
}
