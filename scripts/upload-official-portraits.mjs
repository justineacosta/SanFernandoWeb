// One-time migration helper (Plan 6): push the 12 bundled official portraits
// to the `officials-media` bucket at the deterministic paths seeded by
// supabase/migrations/0012_officials.sql.
//
// Run BEFORE applying 0012 so the objects exist when the rows land:
//   node scripts/upload-official-portraits.mjs
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

// source filename → storage path (must match 0012_officials.sql exactly)
const PORTRAITS = [
  ["Punong Barangay - Domini B. Dela Cruz.jpg", "officials/dominic-b-dela-cruz.jpg", "image/jpeg"],
  ["Kagawad No. 1 - Hon. Geroly B. Aggasid.png", "officials/geroly-b-aggasid.png", "image/png"],
  ["Kagawad No. 2 - Hon. Ronnel T. Paguirigan.png", "officials/ronnel-t-paguirigan.png", "image/png"],
  ["Kagawad No. 3 - Hon. Segundo T. Butay.png", "officials/segundo-t-butay.png", "image/png"],
  ["Kagawad No. 4 - Hon. Noel A. Ribao.png", "officials/noel-a-ribao.png", "image/png"],
  ["Kagawad No. 5 - Hon. Ruthsen Faye M. Gonzales.png", "officials/ruthsen-faye-m-gonzales.png", "image/png"],
  ["Kagawad No. 6 - Hon. Lydia B. Butay.png", "officials/lydia-b-butay.png", "image/png"],
  ["Kagawad No. 7 - Hon. Mariene A. Butay.png", "officials/mariene-a-butay.png", "image/png"],
  ["Barangay SK Chairman - Hon. Jake B. De La Cruz.png", "officials/jake-b-de-la-cruz.png", "image/png"],
  ["Barangay Secretary - Sharah Mae R. Lagundi.png", "officials/sharah-mae-r-lagundi.png", "image/png"],
  ["Barangay Treasurer - Mariela A. Tolentino.png", "officials/mariela-a-tolentino.png", "image/png"],
  ["Barangay Administrative Assistant - Mary Kaye A. Maltezo.png", "officials/mary-kaye-a-maltezo.png", "image/png"],
];

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
for (const [filename, path, contentType] of PORTRAITS) {
  const body = await readFile(join("src", "images", "officials", filename));
  const { error } = await supabase.storage
    .from("officials-media")
    .upload(path, body, { contentType, upsert: true });
  if (error) {
    console.error(`FAIL ${path}: ${error.message}`);
    failed += 1;
  } else {
    console.log(`ok   ${path} (${(body.length / 1024).toFixed(0)} KB)`);
  }
}
console.log(failed === 0 ? `\nAll ${PORTRAITS.length} portraits uploaded.` : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
