# Hardening Backlog A1–A5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close section A of `docs/HARDENING_BACKLOG.md` in full — stop trusting a forgeable IP header, verify upload bytes against their declared type, add bucket-level ceilings, record the malware-scanning decision, and give assistance filing a per-person rate-limit dimension.

**Architecture:** Five independent changes sharing one spec. A1 is a single conditional in `requestIp()` plus an env assertion. A2 adds one pure function to `src/lib/storage.ts` and calls it at six upload chokepoints. A3 is a migration plus the matching baseline edit. A4 is documentation only. A5 adds a second rate-limit key to one Server Action. Nothing here adds a dependency.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres + Storage), Vitest (pure functions only), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-11-hardening-a1-a5-design.md`
**Branch:** `hardening-a1-a5` (already created, spec committed at `2039af5`).

## Global Constraints

- **Migration `0036` is applied manually by the owner.** Never assume it is applied. It has **no deploy-order hazard in either direction** — its ceilings equal what app code already enforces.
- **Every new migration must also be written into `supabase/baseline/0000_baseline_2026-07-23.sql`.** Migration `0029` was missed there and would have produced a production site with zero rate limiting.
- **Applied migrations are historical records — never retro-edit them.** `0036` is new, so it is editable until the owner applies it; `0028`/`0032` are not.
- **Vitest is for pure functions only.** A module under test must not transitively import a Supabase client. `src/lib/storage.ts` imports only `@/types` — keep it that way.
- **One rejection string per failure class.** A prober must not learn which check it tripped. Every A2 rejection reuses the call site's *existing* declared-type message verbatim.
- **Use only amber/ink design tokens.** No UI in this plan, but no blue tokens may appear if any copy changes.
- **`npm run typecheck`, `npm run lint`, `npm run test:unit` must pass before every commit.**
- **e2e budget:** `login.spec.ts` spends 6 hits against a 5-per-5-min budget and collides with itself by design — one run per window. A failure inside that window is a collision, not a regression.
- **Docs are updated in the same session as the code**, in the `.claude/*.md` file that owns the area.

---

### Task 1: A3 — bucket ceilings (migration `0036` + baseline)

Ships first because it has no deploy-order hazard, so the owner can apply it while the rest is built.

**Files:**
- Create: `supabase/migrations/0036_bucket_upload_limits.sql`
- Modify: `supabase/baseline/0000_baseline_2026-07-23.sql:1273-1309`
- Modify: `.claude/storage.md`
- Modify: `.claude/deployment.md`

**Interfaces:**
- Consumes: nothing.
- Produces: no code symbols. Later tasks do not depend on this one.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0036_bucket_upload_limits.sql`:

```sql
-- 0036 — Bucket-level upload ceilings (hardening backlog A3).
--
-- Until now the 3 x 2 MB cap existed ONLY in app code (MAX_TICKET_FILES /
-- MAX_TICKET_FILE_BYTES in src/lib/storage.ts). Supabase Storage can enforce
-- size and MIME at the bucket, which is a second layer that costs nothing and
-- needs no application change.
--
-- Every value below equals what app code already enforces, so no legitimate
-- upload changes behaviour and there is no deploy-order hazard in either
-- direction: this may be applied before or after the code that ships with it.

-- ── Size ceilings: safe on every bucket ──────────────────────────────────────
-- A promoted copy is the same byte count as its source, so file_size_limit
-- cannot break promoteMedia the way allowed_mime_types can (see below).

-- 10 MB — MAX_PDF_BYTES / MAX_DOC_FILE_BYTES. Scanned ordinances run big.
update storage.buckets set file_size_limit = 10485760
  where id in ('legislative-media', 'legislative-drafts',
               'transparency-media', 'transparency-drafts');

-- 2 MB — MAX_IMAGE_BYTES, MAX_SCREENSHOT_BYTES, MAX_TICKET_FILE_BYTES.
update storage.buckets set file_size_limit = 2097152
  where id in ('news-media', 'news-drafts',
               'officials-media', 'officials-drafts',
               'events-media', 'events-drafts',
               'announcements-media', 'announcements-drafts',
               'site-media', 'avatars-media',
               'feedback-media', 'ticket-media');

-- ── MIME allow-lists: ONLY the two pure-ingest private buckets ───────────────
-- Deliberately NOT applied to the six status-aware pairs. promoteMedia
-- (src/lib/media-lifecycle.ts) re-uploads with `contentType: file.type ||
-- undefined`; when that download yields no type, Supabase sends a default that
-- a restrictive allowed_mime_types would REJECT — and promoteMedia fails
-- closed, so publishing would break in production.
--
-- ticket-media and feedback-media have no lifecycle: nothing is ever promoted
-- or demoted between them, so they are pure ingest and safe to restrict.
--
-- Widening this to the status-aware pairs requires making promoteMedia send an
-- explicit contentType first. That is a separate change, not this one.

-- ALLOWED_DOC_FILE_TYPES
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  where id = 'ticket-media';

-- ALLOWED_IMAGE_TYPES — no PDF: a screenshot is an image.
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
  where id = 'feedback-media';
```

- [ ] **Step 2: Mirror the values into the baseline**

In `supabase/baseline/0000_baseline_2026-07-23.sql`, the three bucket `insert` blocks at lines 1273–1309 currently list `(id, name, public)`. Replace each with the column list including ceilings. The public status-aware buckets block becomes:

```sql
insert into storage.buckets (id, name, public, file_size_limit) values
  ('news-media', 'news-media', true, 2097152),
  ('officials-media', 'officials-media', true, 2097152),
  ('events-media', 'events-media', true, 2097152),
  ('announcements-media', 'announcements-media', true, 2097152),
  ('legislative-media', 'legislative-media', true, 10485760),
  ('transparency-media', 'transparency-media', true, 10485760),
  ('site-media', 'site-media', true, 2097152),
  ('avatars-media', 'avatars-media', true, 2097152)
  on conflict (id) do nothing;
```

The drafts block becomes:

```sql
insert into storage.buckets (id, name, public, file_size_limit) values
  ('news-drafts', 'news-drafts', false, 2097152),
  ('officials-drafts', 'officials-drafts', false, 2097152),
  ('events-drafts', 'events-drafts', false, 2097152),
  ('announcements-drafts', 'announcements-drafts', false, 2097152),
  ('legislative-drafts', 'legislative-drafts', false, 10485760),
  ('transparency-drafts', 'transparency-drafts', false, 10485760)
  on conflict (id) do nothing;
```

The two private single-bucket inserts keep their existing explanatory comments above them, and gain MIME allow-lists:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('feedback-media', 'feedback-media', false, 2097152,
          array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;
```

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('ticket-media', 'ticket-media', false, 2097152,
          array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;
```

- [ ] **Step 3: Add a baseline comment explaining why MIME is limited to two buckets**

Directly above the `feedback-media` insert in the baseline, add:

```sql
-- allowed_mime_types is set HERE and on ticket-media only, never on the six
-- status-aware pairs above: promoteMedia re-uploads with a possibly-undefined
-- contentType, which a restrictive allow-list would reject, and it fails closed
-- — publishing would break. These two buckets have no lifecycle. [0036]
```

- [ ] **Step 4: Verify the SQL parses**

There is no local Postgres in this project, so this is a read-through, not an execution:

Run: `git diff --stat supabase/`
Expected: exactly two files changed. Re-read both diffs and confirm every bucket id in the migration exists in the baseline, and that no bucket appears in two `file_size_limit` groups.

- [ ] **Step 5: Update the docs**

In `.claude/storage.md`, under the buckets section, add:

```markdown
### Bucket-level ceilings (migration `0036`)

Every bucket carries a `file_size_limit` equal to what app code already enforces (10 MB for
`legislative-*`/`transparency-*`, 2 MB everywhere else), so the app cap and the bucket cap
cannot drift into disagreement without someone editing both.

**`allowed_mime_types` is set on `ticket-media` and `feedback-media` only.** Not an
oversight: `promoteMedia` re-uploads with `contentType: file.type || undefined`, so a
status-aware bucket with a MIME allow-list would reject a promoted copy whose downloaded
type came back empty — and `promoteMedia` fails closed, so publishing breaks. Those two
buckets are pure ingest with no lifecycle, so they are safe. Restricting the other twelve
requires giving `promoteMedia` an explicit `contentType` first.
```

In `.claude/deployment.md`, add `0036` to the migration list with the note: **no deploy-order hazard in either direction — ceilings equal what code already enforces, so it may be applied before or after the code.**

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0036_bucket_upload_limits.sql supabase/baseline/0000_baseline_2026-07-23.sql .claude/storage.md .claude/deployment.md
git commit -m "feat(storage): bucket-level size and MIME ceilings (migration 0036)"
```

- [ ] **Step 7: Announce the migration to the owner**

Stop and tell the owner `0036` exists and is ready for staging. Do not proceed on the assumption it has been applied.

---

### Task 2: A2 — `sniffMimeType`, the pure function (TDD)

**Files:**
- Modify: `src/lib/storage.ts` (append after `extForDocType`, around line 152)
- Test: `tests/unit/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function sniffMimeType(bytes: Uint8Array): string | null` from `@/lib/storage`. Returns one of `"image/png" | "image/jpeg" | "image/webp" | "application/pdf"`, or `null` when the bytes match none. Tasks 3 and 4 call it as `sniffMimeType(buffer) !== file.type`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/storage.test.ts`, and add `sniffMimeType` to the existing import block at the top of the file:

```ts
describe("sniffMimeType", () => {
  // Real leading bytes for each accepted type. Only the signature matters, so
  // the remainder is zero padding rather than a valid file body.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  it("recognises each of the four accepted types", () => {
    expect(sniffMimeType(png)).toBe("image/png");
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
    expect(sniffMimeType(webp)).toBe("image/webp");
    expect(sniffMimeType(pdf)).toBe("application/pdf");
  });

  it("returns null for an empty buffer", () => {
    expect(sniffMimeType(new Uint8Array([]))).toBeNull();
  });

  it("returns null for a buffer shorter than the signature it starts to match", () => {
    // The first three PNG bytes, then nothing — must not read past the end.
    expect(sniffMimeType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP", () => {
    // "RIFF" then "AVI " — the offset-8 check is what separates them, and a
    // sniffer that only matched "RIFF" would call this an image/webp.
    const avi = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(sniffMimeType(avi)).toBeNull();
  });

  it("returns null for a text file renamed to look like a PDF", () => {
    // The case the whole function exists for: `file.type` says application/pdf,
    // the bytes say "hello wor". The caller's !== comparison rejects it.
    const text = new TextEncoder().encode("hello world, not a pdf");
    expect(sniffMimeType(text)).toBeNull();
    expect(sniffMimeType(text)).not.toBe("application/pdf");
  });

  it("does not report a JPEG as any other accepted type", () => {
    // Guards the caller contract: a mismatch is detected by inequality, so a
    // sniffer returning the WRONG non-null type would silently pass nothing.
    expect(sniffMimeType(jpeg)).not.toBe("application/pdf");
    expect(sniffMimeType(jpeg)).not.toBe("image/png");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- storage`
Expected: FAIL — `sniffMimeType is not exported by @/lib/storage` (a TypeScript/import error, before any assertion runs).

- [ ] **Step 3: Implement the function**

Append to `src/lib/storage.ts`, immediately after `extForDocType`:

```ts
/**
 * The MIME type the first bytes actually claim, or null when they match none
 * of the four types this site accepts.
 *
 * `file.type` is supplied by whatever posted the request and is not evidence
 * of anything — and every uploader here then hands that same unverified string
 * to Storage as `contentType`. This reads the bytes instead. Callers reject on
 * `sniffMimeType(buffer) !== file.type`, which makes an unrecognised file a
 * rejection without needing a separate branch for it.
 *
 * Deliberately pure and dependency-free: this module must stay importable by
 * Vitest, which cannot load anything that transitively pulls in a Supabase
 * client — and a byte-signature check is exactly the kind of logic the browser
 * suite cannot reach.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  const startsWith = (offset: number, signature: readonly number[]): boolean =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, i) => bytes[offset + i] === byte);

  // 0x89 P N G CR LF SUB LF — the longest of the four, and self-verifying.
  if (startsWith(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // SOI plus the first marker byte; the marker's own second byte varies by encoder.
  if (startsWith(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // "RIFF" <4-byte size> "WEBP" — the offset-8 tag is what separates a WebP
  // from every other RIFF container (AVI, WAV), so both halves are required.
  if (startsWith(0, [0x52, 0x49, 0x46, 0x46]) && startsWith(8, [0x57, 0x45, 0x42, 0x50])) {
    return "image/webp";
  }
  // "%PDF-"
  if (startsWith(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- storage`
Expected: PASS, all cases green.

- [ ] **Step 5: Full gate**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage.ts tests/unit/storage.test.ts
git commit -m "feat(storage): add sniffMimeType byte-signature check"
```

---

### Task 3: A2 — wire the two anonymous public upload paths

The higher-risk half: both call sites are reachable without authentication.

**Files:**
- Modify: `src/lib/media.ts:237` (`uploadTicketAttachment`) and `src/lib/media.ts:178` (`uploadFeedbackScreenshot`)

**Interfaces:**
- Consumes: `sniffMimeType` from `@/lib/storage` (Task 2).
- Produces: no new symbols. Behaviour change only.

- [ ] **Step 1: Add the import**

In `src/lib/media.ts`, add `sniffMimeType` to the existing `@/lib/storage` import block.

- [ ] **Step 2: Guard `uploadTicketAttachment`**

Covers assistance filing *and* resident replies — they share this function. Replace lines 236–238:

```ts
  // ticketNo is server-derived (matched against the DB), never client free text.
  const path = `${ticketNo}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
```

with:

```ts
  // ticketNo is server-derived (matched against the DB), never client free text.
  const path = `${ticketNo}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // file.type got us this far, but it is the caller's own claim. The bytes have
  // to agree with it. Same rejection string as the declared-type check above,
  // deliberately: a prober must not learn which of the two it tripped.
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Attachments must be JPG, PNG, WebP, or PDF.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
```

- [ ] **Step 3: Guard `uploadFeedbackScreenshot`**

Replace lines 177–179:

```ts
  const path = feedbackScreenshotPath(extForType(file.type));
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
```

with:

```ts
  const path = feedbackScreenshotPath(extForType(file.type));
  const buffer = Buffer.from(await file.arrayBuffer());
  // Second anonymous upload path on the site, and it carries the same weakness
  // the ticket path did — the backlog named only the ticket one.
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Screenshots must be JPG, PNG, or WebP.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
```

- [ ] **Step 4: Confirm no file is read twice**

Run: `grep -n "arrayBuffer()" src/lib/media.ts`
Expected: exactly three occurrences (lines ~99, ~178, ~237) — the same count as before this task. A fourth would mean a second read was introduced.

- [ ] **Step 5: Full gate**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/media.ts
git commit -m "feat(storage): verify upload bytes on both anonymous public paths"
```

---

### Task 4: A2 — wire the four authenticated upload paths

**Files:**
- Modify: `src/lib/media.ts:99` (`uploadSingleImage`)
- Modify: `src/app/api/admin/uploads/document/route.ts:121`
- Modify: `src/features/admin/actions/news.ts:150`
- Modify: `src/features/admin/actions/achievement-photos.ts:116`

**Interfaces:**
- Consumes: `sniffMimeType` from `@/lib/storage` (Task 2).
- Produces: no new symbols.

**Why these are separate call sites:** `news.ts` and `achievement-photos.ts` do **not** route through `uploadSingleImage`. Each calls `admin.storage.from(bucket).upload(...)` directly with its own inline checks, so patching the shared helper alone would miss both.

- [ ] **Step 1: Guard `uploadSingleImage`**

In `src/lib/media.ts`, replace lines 98–100:

```ts
  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
```

with:

```ts
  const path = `${folder}/${crypto.randomUUID()}.${extForType(file.type)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  if (sniffMimeType(buffer) !== file.type) {
    return { error: "Images must be JPG, PNG, or WebP.", src: null, url: null };
  }
  const admin = createSupabaseAdminClient();
```

- [ ] **Step 2: Guard the document Route Handler**

In `src/app/api/admin/uploads/document/route.ts`, add `sniffMimeType` to the existing `@/lib/storage` import, then replace lines 120–122:

```ts
    const path = `${kind}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
```

with:

```ts
    const path = `${kind}/${crypto.randomUUID()}.${extForDocType(file.type)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (sniffMimeType(buffer) !== file.type) {
      // cleanupUploaded() before returning, exactly as the two checks above do:
      // earlier files in this same loop may already be in the bucket.
      await cleanupUploaded();
      return fail(kind === "legislative" ? "The document must be a PDF." : "Files must be a PDF or image.", 400);
    }
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
```

- [ ] **Step 3: Guard news photo uploads**

In `src/features/admin/actions/news.ts`, add `sniffMimeType` to the existing `@/lib/storage` import, then replace lines 149–151:

```ts
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
```

with:

```ts
    const path = newsPhotoPath(articleId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    // rollback(), not a bare return: earlier photos in this loop are already
    // uploaded and rowed, and this function's invariant is all-or-nothing.
    // The string matches the declared-type rejection at line 111.
    if (sniffMimeType(buffer) !== file.type) {
      return rollback("Photos must be JPG, PNG, or WebP.");
    }
    const { error: upErr } = await admin.storage
```

- [ ] **Step 4: Guard achievement photo uploads**

In `src/features/admin/actions/achievement-photos.ts`, add `sniffMimeType` to the existing `@/lib/storage` import, then replace lines 115–117:

```ts
    const path = achievementPhotoPath(achievementId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
```

with:

```ts
    const path = achievementPhotoPath(achievementId, extForType(file.type));
    const buffer = Buffer.from(await file.arrayBuffer());
    if (sniffMimeType(buffer) !== file.type) {
      return { error: "Photos must be JPG, PNG, or WebP.", photos: [] };
    }
    const { error: upErr } = await admin.storage
```

- [ ] **Step 5: Confirm every ingest point is covered**

Run these two and compare the file lists:

```bash
grep -rn "arrayBuffer()" src/          # every place a file's bytes are read
grep -rn "sniffMimeType" src/          # every place they are verified
```

Expected: `arrayBuffer()` returns **seven** hits, `sniffMimeType` returns **seven** (six guards
plus the definition in `storage.ts`). The one `arrayBuffer()` line with no guard beside it must
be `src/lib/media-lifecycle.ts:34`, which is **correctly excluded** — it re-uploads bytes it
just downloaded from another bucket, so it is a copy of an already-validated object, not an
ingest point. Any *other* unguarded hit is a missed call site.

- [ ] **Step 6: Update the docs**

In `.claude/storage.md`, add under the core-invariant section:

```markdown
- **Every ingest point verifies bytes against the declared type.** `sniffMimeType`
  (`src/lib/storage.ts`, unit-tested) reads the first 12 bytes of the buffer the uploader
  already holds and the caller rejects on `!== file.type`. Six call sites:
  `uploadTicketAttachment`, `uploadFeedbackScreenshot`, `uploadSingleImage`, the document
  Route Handler, `attachPendingPhotos` (news) and `uploadAchievementPhotos`. **The last two
  do not route through `uploadSingleImage`** — they upload directly, which is why patching
  the shared helper alone was not enough. Each rejection reuses that call site's existing
  declared-type string so a prober cannot tell the two checks apart. `media-lifecycle.ts`'s
  promote/demote copy is deliberately exempt: it re-uploads already-validated bytes.
```

In `.claude/security.md`, add to the non-negotiables list:

```markdown
5. **A declared MIME type is a claim, not evidence.** Every upload path verifies the leading
   bytes with `sniffMimeType` before the object reaches Storage — including the two anonymous
   public paths (ticket attachments, feedback screenshots).
```

- [ ] **Step 7: Full gate**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/media.ts src/app/api/admin/uploads/document/route.ts src/features/admin/actions/news.ts src/features/admin/actions/achievement-photos.ts .claude/storage.md .claude/security.md
git commit -m "feat(storage): verify upload bytes on the four authenticated paths"
```

---

### Task 5: A1 — `requestIp()` stops trusting `cf-connecting-ip`

**Files:**
- Modify: `src/lib/rate-limit.ts:110-142`
- Modify: `.env.example`
- Modify: `tests/e2e/admin/login.spec.ts:11-50`
- Modify: `tests/e2e/public/assistance-form.spec.ts:4-27`
- Modify: `.claude/security.md`, `.claude/testing.md`, `.claude/deployment.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `requestIp(): Promise<string>` — signature **unchanged**. No call site changes.

- [ ] **Step 1: Replace the header resolution**

In `src/lib/rate-limit.ts`, replace the whole doc comment and function at lines 110–142 with:

```ts
/**
 * Header names a deployment may be configured to trust — a closed list, not a
 * free string. `TRUSTED_IP_HEADER` names which upstream this app sits behind;
 * an attacker-chosen header name must never become readable just by setting an
 * env var to it.
 */
const TRUSTED_IP_HEADERS = ["cf-connecting-ip"] as const;

/**
 * Resolved once per server instance rather than per request, so a typo warns
 * once instead of on every call — and silently doing nothing is exactly how a
 * misconfiguration here would hide.
 */
const TRUSTED_IP_HEADER: string | null = (() => {
  const configured = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  if (!configured) return null;
  if ((TRUSTED_IP_HEADERS as readonly string[]).includes(configured)) return configured;
  console.warn(
    `TRUSTED_IP_HEADER="${configured}" is not a recognised proxy header; ignoring it. ` +
      `Accepted values: ${TRUSTED_IP_HEADERS.join(", ")}.`,
  );
  return null;
})();

/**
 * Caller IP from the proxy headers, or a shared fallback bucket.
 *
 * **`cf-connecting-ip` is read only when TRUSTED_IP_HEADER names it.** This
 * deployment is bare Vercel — verified 2026-08-11: production answers with
 * `Server: Vercel` and no `cf-*` headers at all, and a `*.vercel.app` host
 * cannot be Cloudflare-proxied. So no request arrives via Cloudflare and every
 * `cf-connecting-ip` that shows up is forged by its sender. Reading it
 * unconditionally, as this did until the A1 hardening pass, let any caller pick
 * its own bucket for every IP-keyed limit on the site — and buy one
 * unchallenged guess per account against /admin/login's adaptive CAPTCHA.
 *
 * Using Turnstile is NOT a Cloudflare hop: it is a browser widget plus an
 * outbound siteverify call. It never terminates an inbound request, so it never
 * sets this header. Don't let its presence talk you into trusting one.
 *
 * Unset is the safe default — a deploy that forgets the variable is more
 * restrictive, not less. This is the opposite of the limiter's fail-open
 * posture, deliberately: failing open here means trusting a forged value.
 *
 * Otherwise: the LAST entry of X-Forwarded-For, not the first. Each hop appends
 * the IP it received the request from, so the first entry is whatever the
 * client itself claimed. On Vercel this is already trustworthy — Vercel
 * overwrites XFF and does not forward externally-supplied values, specifically
 * to prevent spoofing; a client-controlled XFF needs an Enterprise trusted-proxy
 * purchase this deployment does not have.
 */
export async function requestIp(): Promise<string> {
  const { headers } = await import("next/headers");
  const store = await headers();

  if (TRUSTED_IP_HEADER) {
    const trusted = store.get(TRUSTED_IP_HEADER)?.trim();
    if (trusted) return trusted;
  }

  const forwarded = store.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (ips.length > 0) return ips[ips.length - 1];
  }

  return store.get("x-real-ip")?.trim() || "unknown";
}
```

- [ ] **Step 2: Document the variable in `.env.example`**

Append:

```bash
# Names the header carrying the real client IP, when — and only when — a trusted
# proxy in front of this app sets it. LEAVE IT UNSET on Vercel-only deployments:
# without a proxy, any caller can send `cf-connecting-ip` and choose its own
# bucket for every IP-keyed rate limit on the site.
#
# Vercel overwrites x-forwarded-for and does not forward client-supplied values,
# so the unset default is already correct and safe there.
#
# Turnstile does NOT count as a Cloudflare hop — it is an outbound siteverify
# call, not a proxy. Set this only if traffic genuinely routes through Cloudflare.
#
# Accepted values: cf-connecting-ip
# TRUSTED_IP_HEADER=cf-connecting-ip
```

- [ ] **Step 3: Switch `login.spec.ts` to forging `x-forwarded-for`**

Replace the doc comment at lines 11–31 and the header line at 47. The comment's first paragraph becomes:

```ts
/**
 * Every request in this file gets a unique, run-scoped `x-forwarded-for`.
 *
 * `requestIp()` takes the LAST entry of that header, so this puts each run on
 * its own `login:ip:*` bucket instead of the machine's shared one — exactly as
 * if the run came from a fresh client. Without it these tests are not
 * idempotent: `login:ip:*` is shared by every failed login on this machine, so
 * one run leaves the next one starting from a flagged IP, and (since Task 4B
 * made the page server-render the challenge from that key) `auth.setup.ts`'s
 * own correct-password sign-in starts demanding a token it never provides,
 * failing the whole `admin` project rather than just this file.
 *
 * NOT `cf-connecting-ip`, which this file used until the A1 hardening pass:
 * `requestIp()` now ignores that header unless TRUSTED_IP_HEADER names it, and
 * this deployment is bare Vercel. Forging XFF works locally because the dev
 * server has no proxy in front to overwrite it — and is inert against
 * production, where Vercel overwrites it. The technique cannot be turned into
 * an attack on the deployed site.
 *
 * Nothing about the code under test changes and no limit is raised or
 * disabled — the email-keyed budget, which is what the first test actually
 * exercises, is untouched.
 *
 * Scoped to the app's own origin via `route()`, deliberately NOT
 * `test.use({ extraHTTPHeaders })`: the latter would also send the forged
 * header to `challenges.cloudflare.com`, whose edge then refuses to serve the
 * widget script, and the widget never issues a token.
 */
```

And line 47 becomes:

```ts
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
```

- [ ] **Step 4: Switch `assistance-form.spec.ts` to forging `x-forwarded-for`**

Replace lines 11–16 of its doc comment:

```ts
 * limiter rather than on a regression. Pinned to its own bucket via a forged
 * `x-forwarded-for` (NOT `cf-connecting-ip` — `requestIp()` ignores that
 * header since the A1 hardening pass), following the exact pattern
 * `tests/e2e/admin/login.spec.ts` established: `page.route()` scoped to the
 * app's own origin, deliberately NOT `test.use({ extraHTTPHeaders })`, which
 * would also send the forged header to `challenges.cloudflare.com` and get the
 * Turnstile widget refused by its edge.
```

And line 24 becomes:

```ts
      headers: { ...route.request().headers(), "x-forwarded-for": ip },
```

- [ ] **Step 5: Verify no forged `cf-connecting-ip` remains**

Run: `grep -rn "cf-connecting-ip" src/ tests/`
Expected: **zero** matches in `tests/`. In `src/`, only the `TRUSTED_IP_HEADERS` allow-list and the explanatory comments in `rate-limit.ts`. `src/lib/turnstile.ts:58`'s mention of `"unknown"` is unrelated and stays.

- [ ] **Step 6: Run the public e2e suite**

Run: `npm run test:e2e -- --project=public`
Expected: PASS. This project needs no login. If `assistance-form.spec.ts` fails, treat it as a **real failure first** — it forges a fresh IP per run, so it does not collide with itself.

- [ ] **Step 7: Run the admin login suite once**

Run: `npm run test:e2e -- --project=admin -g "login"`
Expected: PASS. **One run per 5-minute window only** — it spends 6 hits against a 5-per-5-min email-keyed budget and collides with itself by design. A second run inside that window failing is a collision, not a regression.

- [ ] **Step 8: Update the docs**

In `.claude/security.md`, replace the `requestIp()` bullet (currently lines 28–34) with:

```markdown
- **`requestIp()` trusts the LAST `X-Forwarded-For` entry, not the first**, and reads
  `cf-connecting-ip` **only when `TRUSTED_IP_HEADER` names it** (a closed allow-list; unset
  is the default and the safe one). Every IP-keyed bucket on the site derives from this one
  helper.
  **The deployed topology is asserted, not assumed:** production is bare Vercel — verified
  2026-08-11 by response headers (`Server: Vercel`, zero `cf-*`) and by the `*.vercel.app`
  host, which cannot be Cloudflare-proxied. Vercel overwrites XFF and does not forward
  client-supplied values, so the last-entry rule is correct there and needs no extra hop
  counting. **Using Turnstile is not a Cloudflare hop** — it is an outbound `siteverify`
  call, and mistaking it for one is what made the old unconditional trust look reasonable.
  If a real proxy is ever put in front, set `TRUSTED_IP_HEADER` and re-check this bullet.
```

In `.claude/testing.md`, replace the forging bullet (lines 67–71) with:

```markdown
- **Forge `x-forwarded-for` with a `page.route()` interception scoped to the app's own
  origin — never `test.use({ extraHTTPHeaders })`.** The latter also sends the forged header
  to `challenges.cloudflare.com`, whose edge then refuses to serve the widget script.
  `login.spec.ts` established the pattern to pin each run to its own `login:ip:*` bucket;
  `assistance-form.spec.ts` copies it. **Not `cf-connecting-ip`** — `requestIp()` ignores
  that header unless `TRUSTED_IP_HEADER` names it. Forging XFF works locally (no proxy to
  overwrite it) and is inert against production (Vercel overwrites it). The **email** key
  still collides by design.
```

In `.claude/deployment.md`, add `TRUSTED_IP_HEADER` to the env-var list, noting that unset is correct for this deployment.

- [ ] **Step 9: Full gate and commit**

Run: `npm run typecheck && npm run lint && npm run test:unit`

```bash
git add src/lib/rate-limit.ts .env.example tests/e2e/admin/login.spec.ts tests/e2e/public/assistance-form.spec.ts .claude/security.md .claude/testing.md .claude/deployment.md
git commit -m "fix(security): stop trusting cf-connecting-ip unconditionally"
```

---

### Task 6: A5 — per-person dimension on assistance filing

**Files:**
- Modify: `src/features/assistance/actions.ts:22-24, 48-95`
- Modify: `tests/e2e/public/assistance-form.spec.ts:39`
- Modify: `.claude/security.md` (budget table)

**Interfaces:**
- Consumes: `checkRateLimit`, `requestIp` from `@/lib/rate-limit` (already imported in this file).
- Produces: no exported symbols.

- [ ] **Step 1: Add the contact-key constant**

In `src/features/assistance/actions.ts`, below the existing `SUBMIT_LIMIT`/`SUBMIT_WINDOW_MS` declarations at lines 22–24, add:

```ts
/**
 * Second rate-limit dimension, so distributed abuse is bounded per person and
 * not only per connection — the shape `login:email:*` and `reply:ticket:*`
 * already use.
 *
 * Keyed on contactNumber, NOT email: `residentFields.email` is
 * `optionalEmailField`, so blank is valid and common. Keying on it would drop
 * every resident without an email into one shared `assistance:email:` bucket
 * and let the first five per hour lock out all the rest — the same shared-bucket
 * flaw as requestIp()'s "unknown" fallback, aimed squarely at the residents
 * least likely to have email and most likely to be filing for assistance.
 * contactNumber is required (>= 7 digits), so it has no empty case.
 *
 * Accepted trade-off: someone who knows a resident's number can deliberately
 * burn that number's hourly budget. Identical to what `login:email:*` already
 * allows for a known account, it costs a Turnstile solve per attempt, it
 * expires in an hour, and the barangay hall counter is unaffected.
 */
const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_MS = 60 * 60 * 1000;

/** Digits only, so "(077) 600-1082" and "0776001082" are one bucket. NOT
 *  normaliseMobile(): that returns null for landlines, which would reintroduce
 *  the empty-bucket problem for exactly the residents who call from one. */
function contactKey(contactNumber: string): string {
  return `assistance:contact:${contactNumber.replace(/\D/g, "")}`;
}
```

- [ ] **Step 2: Add the check after Zod**

In `submitAssistance`, immediately after the `parsed.success` block ends (currently line 68) and **before** the `files.length` check at line 73, insert:

```ts
  // AFTER Zod, deliberately: a malformed or absent number must not be able to
  // spend anyone's budget. The IP key above stays FIRST as the cheapest
  // rejection — same ordering rule `reply:ticket:*` follows for the same class
  // of reason (see .claude/security.md).
  if (!(await checkRateLimit(contactKey(parsed.data.contactNumber), CONTACT_LIMIT, CONTACT_WINDOW_MS))) {
    return {
      error:
        "We have already received several requests for this contact number. Please try again later or visit the barangay hall.",
      ticketNo: null,
      attachmentWarning: null,
    };
  }
```

- [ ] **Step 3: Make the e2e contact number unique per run**

`tests/e2e/public/assistance-form.spec.ts:39` currently fills a **fixed** `(077) 600-0000`. With the new key, every run of this test would spend budget on the same `assistance:contact:0776000000` bucket and the suite would start failing after 5 runs an hour — a self-collision it does not have today. Replace line 39:

```ts
  await page.getByLabel("Contact number").fill("(077) 600-0000");
```

with:

```ts
  // Unique per run, for the same reason the surname above is: `submitAssistance`
  // now also rate-limits on `assistance:contact:<digits>` at 5/hour, so a fixed
  // number would make this suite collide with itself after five runs.
  await page.getByLabel("Contact number").fill(`(077) 600-${String(Date.now()).slice(-4)}`);
```

- [ ] **Step 4: Run the public suite**

Run: `npm run test:e2e -- --project=public -g "assistance"`
Expected: PASS. Run it **twice in a row** — the second run proves the contact key no longer self-collides. Both runs spend one `assistance:<ip>` hit each, but each forges its own IP, so the IP budget is not the constraint.

- [ ] **Step 5: Update the budget table**

In `.claude/security.md`'s "Every budget currently in force" table, add a row directly under the `assistance:<ip>` entry:

```markdown
| `assistance:contact:<digits>` | `CONTACT_LIMIT` 5 / hour | `features/assistance/actions.ts` |
```

And extend the ordering bullet below the table:

```markdown
  `submitAssistance` follows the same rule from the other direction: its IP key is checked
  before Zod as the cheapest rejection, and its **contact** key only after, so a malformed
  or absent number cannot spend budget. It keys on `contactNumber` rather than the resident's
  email because `residentFields.email` is optional — keying on a blank-able field would put
  every resident without an email into one shared bucket.
```

- [ ] **Step 6: Full gate and commit**

Run: `npm run typecheck && npm run lint && npm run test:unit`

```bash
git add src/features/assistance/actions.ts tests/e2e/public/assistance-form.spec.ts .claude/security.md
git commit -m "feat(security): rate-limit assistance filing per contact number"
```

---

### Task 7: A4 — record the decision, and close the backlog

**Files:**
- Modify: `.claude/security.md`
- Modify: `docs/HARDENING_BACKLOG.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the accepted-risk rationale**

Append to `.claude/security.md`:

```markdown
## Malware scanning — declined, with reasons (2026-08-11)

An explicit decision, not an omission. Resident uploads are **not** scanned, because:

- Both resident buckets (`ticket-media`, `feedback-media`) are **private**, with no read
  policy and no public serving path — a stored file is reachable only through a service-role
  signed URL.
- Ingest is capped at 3 files x 2 MB, and `sniffMimeType` requires the bytes to match a
  declared PDF or image signature, which blocks the cheap disguised-executable case.
- Staff are a handful of named accounts, not an open enterprise attack surface.
- Every scanner option adds a network dependency to ticket filing, a recurring cost, a
  fail-open/fail-closed decision, and ships photographs of residents' IDs to a third party —
  a privacy boundary this codebase does not cross and has repeatedly declined to (feedback
  screenshots, complaint narratives).

**Revisit if** uploads are ever served directly to a browser, or staff begin opening
attachments outside the portal.
```

- [ ] **Step 2: Delete section A from the backlog**

In `docs/HARDENING_BACKLOG.md`, delete the entire `## A. Security` section (A1 through A5) and the sentence in the preamble that reads "The next planned session is a hardening pass over section A." The file's own instruction is to delete entries as they ship rather than let it rot into a wish list. Section B and the rate-limit budget table stay.

Update the preamble's remaining line to note that section A shipped on 2026-08-11 and point at the spec, so the file does not read as though A was forgotten.

- [ ] **Step 3: Add the deferred follow-up that A3 created**

Section A is closed, but Task 1 deliberately left one thing undone. Add to `docs/HARDENING_BACKLOG.md`'s section B:

```markdown
7. **`allowed_mime_types` on the six status-aware bucket pairs.** Migration `0036` set it on
   `ticket-media`/`feedback-media` only. `promoteMedia` re-uploads with
   `contentType: file.type || undefined`, and it fails closed, so a restrictive allow-list on
   a bucket it promotes into would break publishing. Give `promoteMedia` an explicit
   `contentType` first, then widen. Low priority — `file_size_limit` is already set on all
   of them.
```

- [ ] **Step 4: Verify the backlog reads correctly**

Run: `grep -n "A1\|A2\|A3\|A4\|A5" docs/HARDENING_BACKLOG.md`
Expected: **zero** matches. Any surviving reference means a cross-reference was missed.

- [ ] **Step 5: Reconcile every doc claim against the code**

Run: `grep -rn "cf-connecting-ip" .claude/ docs/HARDENING_BACKLOG.md README.md`
Expected: only `.claude/security.md`'s new `TRUSTED_IP_HEADER` bullet and `.claude/testing.md`'s "Not `cf-connecting-ip`" note. **`README.md:83` and `README.md:407` both describe the old behaviour and must be updated** — 407 states the open follow-up that this pass just closed.

- [ ] **Step 6: Commit**

```bash
git add .claude/security.md docs/HARDENING_BACKLOG.md README.md
git commit -m "docs: record the malware-scanning decision and close backlog section A"
```

---

## Final verification (after all seven tasks)

- [ ] **Step 1: Full static gate**

Run: `npm run typecheck && npm run lint && npm run test:unit`
Expected: clean, unit count up by the `sniffMimeType` cases.

- [ ] **Step 2: Production build**

Run: `npx next build`
Expected: success. **Read the route table** — `○` (static) vs `ƒ` (dynamic). The services-flows pass established that a route silently prerendering static is visible only here; dev mode hides it completely. No route's marker should have changed in this pass.

- [ ] **Step 3: Full e2e**

Run: `npm run test:e2e -- --project=public`, then `npm run test:e2e -- --project=admin`
Expected: pass, with the login-suite collision caveat above. `tests/e2e/admin/global-search.spec.ts` fails 4 of 5 **pre-existing** — verified on `main` before this branch, unrelated, and not to be "fixed" here.

- [ ] **Step 4: Manual browser check of the A2 rejection path**

No automated test in this repo performs a real upload, and this is the behaviour the whole of A2 exists for. For each of the two public forms:

1. `cp README.md /tmp/fake.pdf` — a text file with a PDF extension.
2. `/assistance/new` → attach it → submit. **Expected:** rejected with "Attachments must be JPG, PNG, WebP, or PDF." and **no ticket filed**.
3. Feedback widget → attach a `.png`-renamed text file. **Expected:** rejected with "Screenshots must be JPG, PNG, or WebP."
4. Then attach a **real** JPG to each and confirm it still succeeds — a sniffer that rejects everything would pass step 2 and 3 while breaking the feature.

- [ ] **Step 5: Verify `0036` against the live buckets**

Only after the owner confirms it is applied. Query the live project rather than inferring from the migration text:

```sql
select id, file_size_limit, allowed_mime_types from storage.buckets order by id;
```

Expected: 16 buckets; `file_size_limit` non-null on every one; `allowed_mime_types` non-null on `ticket-media` and `feedback-media` only.

- [ ] **Step 6: Request a final whole-branch review**

REQUIRED: use `superpowers:requesting-code-review` for a whole-branch review before merging. **Three times in this project's history the final whole-branch review caught defects that every per-task review passed** — all of them living in the seams between tasks. Do not skip it because the per-task gates were clean.

Points a reviewer should be pushed at specifically:
- Does any upload path reach `storage.upload()` without a `sniffMimeType` guard?
- Does `requestIp()`'s change alter the bucket any *existing* caller resolves to, beyond the intended one?
- Do the `0036` values match `src/lib/storage.ts`'s constants exactly, in both the migration and the baseline?
- Does any doc still assert the pre-pass behaviour?
