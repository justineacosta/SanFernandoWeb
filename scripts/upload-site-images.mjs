// One-time migration helper (sub-project 9): push the bundled Home/About images
// to the `site-media` bucket at the deterministic paths seeded by
// supabase/migrations/0021_site_content.sql.
//
// Run this ONCE PER ENVIRONMENT, in the same sitting as the migration:
//   node scripts/upload-site-images.mjs
//
// Applying 0021 without running this seeds rows pointing at objects that do not
// exist, and the home page renders broken images. Order does not matter — the
// objects may land before or after the rows — but skipping it does.
//
// Idempotent (upsert: true). Creates objects only — never deletes.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local reader — the app uses Next's loader, but a bare node
// script has to parse it itself.
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

// source path (from repo root) → storage path (must match 0021 exactly)
const IMAGES = [
  ["src/images/carousel/Certificate.jpg", "site/hero-certificate.jpg", "image/jpeg"],
  ["src/images/carousel/OrganizationGroupPicture.jpg", "site/hero-organization.jpg", "image/jpeg"],
  ["src/images/carousel/CleaningOperation.jpg", "site/hero-cleaning-operation.jpg", "image/jpeg"],
  ["src/images/carousel/TrickOrTreat.jpg", "site/hero-trick-or-treat.jpg", "image/jpeg"],
  // History timeline: the seal illustrates the 1733 founding entry, and the
  // group photo the present-day entry. The seal is also a bundled static import
  // for SITE.sealImage — that use is unaffected, this is a second copy.
  ["src/images/logo/BarangaySFLogo.png", "site/history-seal.png", "image/png"],
  ["src/images/carousel/OrganizationGroupPicture.jpg", "site/history-community.jpg", "image/jpeg"],
];

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
for (const [source, path, contentType] of IMAGES) {
  const body = await readFile(join(...source.split("/")));
  const { error } = await supabase.storage
    .from("site-media")
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    failed += 1;
  } else {
    console.log(`ok   ${path} (${(body.length / 1024).toFixed(0)} KB)`);
  }
}
console.log(failed === 0 ? `\nAll ${IMAGES.length} site images uploaded.` : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
