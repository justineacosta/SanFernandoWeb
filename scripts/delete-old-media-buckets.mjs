// Deletes the two old shared media buckets, public-media and
// public-documents, once every environment has migrated off them (see
// scripts/migrate-media-buckets.mjs and CLAUDE.md's media-bucket-split
// bullet). This is destructive and irreversible: it removes every object in
// both buckets, then the buckets themselves. Run it ONLY after:
//
//   1. migrate-media-buckets.mjs has been run against this environment with
//      zero FAIL lines (or every failure resolved and re-run clean).
//   2. Migration 0030 has been applied (revokes the buckets' public-read
//      policy) — not required for this script to work, but confirms the
//      app has been fully cut over.
//   3. A spot check of the new per-type buckets in the Supabase dashboard
//      looks right.
//
// Dry-run by default — it only lists what would be deleted. Pass --yes to
// actually delete:
//   node scripts/delete-old-media-buckets.mjs          (dry run)
//   node scripts/delete-old-media-buckets.mjs --yes     (deletes for real)
//
// Run against staging first. Only run against production after staging's
// deletion has been verified to not break anything.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const CONFIRM = process.argv.includes("--yes");
const OLD_BUCKETS = ["public-media", "public-documents"];

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

/** Recursively lists every object path in a bucket — list() only returns one folder level at a time. */
async function listAllPaths(bucket, prefix = "") {
  const { data: entries, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);

  const paths = [];
  for (const entry of entries ?? []) {
    // A folder placeholder has no `id`; a real object always does.
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      paths.push(...(await listAllPaths(bucket, entryPath)));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

const { data: existingBuckets, error: listBucketsError } = await supabase.storage.listBuckets();
if (listBucketsError) throw new Error(`listBuckets: ${listBucketsError.message}`);
const existingIds = new Set(existingBuckets.map((b) => b.id));

for (const bucket of OLD_BUCKETS) {
  console.log(`\n${bucket}:`);

  if (!existingIds.has(bucket)) {
    console.log("  Already gone — no such bucket in this project. Nothing to do.");
    continue;
  }

  const paths = await listAllPaths(bucket);

  if (paths.length === 0) {
    console.log("  (empty)");
  } else {
    for (const path of paths) console.log(`  ${path}`);
  }

  if (!CONFIRM) {
    console.log(`  ${paths.length} object(s) would be deleted, then the bucket itself.`);
    continue;
  }

  if (paths.length > 0) {
    // Storage's remove() accepts multiple paths per call but has its own
    // request-size ceiling — batch defensively rather than assume unlimited.
    const BATCH = 100;
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
    }
    console.log(`  Deleted ${paths.length} object(s).`);
  }

  const { error: deleteBucketError } = await supabase.storage.deleteBucket(bucket);
  if (deleteBucketError) throw new Error(`deleteBucket ${bucket}: ${deleteBucketError.message}`);
  console.log(`  Bucket deleted.`);
}

if (!CONFIRM) {
  console.log("\nDry run only — nothing was deleted. Re-run with --yes to actually delete.");
}
