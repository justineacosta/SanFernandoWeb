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
// drawer, or replacing an announcement image, left the object behind. Both
// paths are closed now, so this list should stop growing.
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

const BUCKET = "public-media";
// Every folder the app writes into, with the column(s) that reference it.
const FOLDERS = ["announcements", "events", "officials", "news", "achievements"];

/** List a folder recursively — storage.list() is one level at a time. */
async function listFolder(prefix) {
  const found = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder placeholder has no id; a real object always has one.
    if (entry.id === null) found.push(...(await listFolder(path)));
    else found.push(path);
  }
  return found;
}

/** Every storage path referenced by a row, across all tables that hold one. */
async function referencedPaths() {
  const referenced = new Set();
  const add = (value) => {
    // Seed rows keep their original remote URLs; those own no object here.
    if (typeof value === "string" && value && !/^https?:\/\//i.test(value)) {
      referenced.add(value);
    }
  };

  const sources = [
    ["announcements", "image_src"],
    ["events", "cover_src"],
    ["officials", "photo_path"],
    ["news_photos", "src"],
    ["official_achievement_photos", "src"],
  ];
  for (const [table, column] of sources) {
    const { data, error } = await supabase.from(table).select(column);
    if (error) throw new Error(`select ${table}.${column}: ${error.message}`);
    for (const row of data ?? []) add(row[column]);
  }
  return referenced;
}

const referenced = await referencedPaths();
const stored = [];
for (const folder of FOLDERS) stored.push(...(await listFolder(folder)));

const orphans = stored.filter((path) => !referenced.has(path));

console.log(`bucket           : ${BUCKET}`);
console.log(`objects stored   : ${stored.length}`);
console.log(`paths referenced : ${referenced.size}`);
console.log(`orphans          : ${orphans.length}`);
if (orphans.length > 0) {
  console.log("\nNo row references these objects:\n");
  for (const path of orphans) console.log(`  ${path}`);
  console.log("\nNothing was deleted. Review the list before removing anything.");
}
