# Hardening pass A1–A5 — design

**Date:** 2026-08-11
**Closes:** `docs/HARDENING_BACKLOG.md` section A in full (A1–A5).
**Branch point:** `main` @ `bc6ce3f`.
**Migration:** `0036` — announced to the owner at design time, not applied yet.

Section B of the backlog is **out of scope** and stays as written.

---

## 0. The finding that reshaped this pass

The backlog assumed A1 might need Cloudflare IP-range validation. It does not, and the
reason is worth recording because it changes the fix from a subsystem into one conditional.

**Production is bare Vercel. There is no Cloudflare proxy in the request path.** Verified
two ways on 2026-08-11:

1. `NEXT_PUBLIC_SITE_URL=https://sanfernando-onse.vercel.app/` — a `*.vercel.app` host sits
   in Vercel's own DNS zone and cannot be Cloudflare-proxied.
2. A live `HEAD` against production returns `Server: Vercel` and
   `X-Vercel-Id: sin1::…`, with **zero** `cf-*` headers — no `cf-ray`, no `Via: cloudflare`.

**Turnstile does not contradict this, and the confusion is the point.** Turnstile is a
browser widget plus a server-to-server `siteverify` call made *outbound* from the app. It
never terminates an inbound request, so it never sets `cf-connecting-ip` on one. Using
Turnstile is not evidence of a Cloudflare hop, and this pass changes nothing about it.

Two consequences:

- **Every `cf-connecting-ip` reaching production today is forged.** There is no legitimate
  sender. The header is not "sometimes trustworthy" — it is never trustworthy here.
- **`x-forwarded-for` is already trustworthy.** Vercel overwrites XFF and does not forward
  externally-supplied values, specifically to prevent IP spoofing; a client-controlled XFF
  requires an Enterprise trusted-proxy purchase, which this deployment does not have.
  (<https://vercel.com/docs/security/reverse-proxy>,
  <https://vercel.com/kb/guide/how-to-setup-verified-proxy>)

So `requestIp()`'s last-entry XFF logic — the part that looks most suspicious — is correct
and stays. The single unearned line is the `cf-connecting-ip` preference above it.

---

## A1. `requestIp()` stops trusting `cf-connecting-ip`

### Change

`src/lib/rate-limit.ts`. The `cf-connecting-ip` branch becomes conditional on an explicit
deployment assertion; everything below it is unchanged.

```
TRUSTED_IP_HEADER unset (default)  → x-forwarded-for last entry → x-real-ip → "unknown"
TRUSTED_IP_HEADER=cf-connecting-ip → cf-connecting-ip first, then the chain above
```

A single env var naming the header, not a boolean, because the next proxy this site sits
behind may name it something else (`x-gcp-connecting-ip`, `cloudfront-viewer-address`). The
allow-list of accepted values is closed and lives beside the function — an arbitrary
attacker-chosen header name must never become readable by setting a string.

**Unset is the safe default**, so a fresh deploy that forgets the variable is *more*
restrictive, not less. This is the opposite of the rate limiter's fail-open posture and
deliberately so: failing open here means trusting a forged value.

### Blast radius

Every IP-keyed bucket on the site derives from this helper — all 8 public forms,
`login:ip:*`, `reset:ip:*`, `track:*`, `reply:ip:*`, `assistance:*` — plus
`/admin/login`'s `initialChallengeRequired`, where rotating the header currently buys one
unchallenged guess per account in a spraying attack.

### Documentation

`.env.example` gains `TRUSTED_IP_HEADER` with the topology written out. `.claude/security.md`
replaces its "nothing asserts that assumption" note with the asserted topology and the
Vercel-overwrites-XFF reasoning. `docs/HARDENING_BACKLOG.md` loses A1.

### Test consequence — real, and handled

`tests/e2e/admin/login.spec.ts:47` and `tests/e2e/public/assistance-form.spec.ts:24` forge
`cf-connecting-ip` to give each run its own rate-limit bucket. Under the new default that
header is ignored and both suites would collapse onto one shared bucket — `login.spec.ts`
would fail on its second run of the day for reasons having nothing to do with the code.

They switch to forging `x-forwarded-for`, which:

- **still works locally** — the Playwright suite hits the dev server directly, with no proxy
  to overwrite the header, so the forged value is the last entry and wins;
- **is inert in production** — Vercel overwrites it, so the test technique cannot be turned
  into an attack against the deployed site.

`.claude/testing.md`'s forging note is updated in the same change. Both files' explanatory
comments (`login.spec.ts:12-14`, `assistance-form.spec.ts:12`) name `cf-connecting-ip` in
prose and must be rewritten, not just the header string — a stale comment here would teach
the next session exactly the wrong lesson.

---

## A2. Magic-byte verification on uploads

### The gap

Every uploader validates `file.type` — a browser-supplied string — and then passes that same
unverified value to Storage as `contentType`. Nothing reads the bytes. Currently bounded by
private buckets, HTML/SVG absent from every allow-list, and extensions derived from the MIME
rather than the filename; the residual risk is a malformed PDF or image aimed at a staff
viewer's parser.

### Change

A pure function in `src/lib/storage.ts`:

```ts
export function sniffMimeType(bytes: Uint8Array): string | null
```

Covering exactly the four allowed types, from the first 12 bytes:

| Type | Signature |
|---|---|
| `application/pdf` | `25 50 44 46 2D` (`%PDF-`) at offset 0 |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` at offset 0 |
| `image/jpeg` | `FF D8 FF` at offset 0 |
| `image/webp` | `52 49 46 46` (`RIFF`) at 0 **and** `57 45 42 50` (`WEBP`) at 8 |

Returns `null` for anything unrecognised. Callers reject when
`sniffMimeType(bytes) !== file.type`, which makes an unrecognised file a rejection without a
separate branch.

**It reads the buffer each caller already holds.** Every call site listed below already does
`Buffer.from(await file.arrayBuffer())` before uploading; the check slots in after that line,
so no file is read twice.

**The rejection reuses each call site's existing declared-type string**, unchanged — "Attachments
must be JPG, PNG, WebP, or PDF." A distinct "file contents do not match" message would tell a
prober which of the two checks it tripped, against the one-rejection-string rule
`.claude/security.md` already states for Turnstile.

### Why `storage.ts`

It imports only `@/types`, so a unit test of it cannot transitively pull in a Supabase client
— the hard constraint on Vitest in this repo. `tests/unit/storage.test.ts` already exists and
gains the cases: each of the four true positives, a JPEG declared as PDF, a PDF declared as
an image, an empty buffer, a 3-byte buffer (shorter than the longest signature), and a
`RIFF`-but-not-`WEBP` container. This is deliberate: A2 is otherwise the kind of change this
suite structurally cannot verify.

### Call sites — six, not two

The backlog names the two resident paths. The other four get it in the same pass because the
check is three lines once the function exists, and leaving uploaders inconsistent invites the
next contributor to copy the wrong one.

| Call site | Reachable by | Buffer line today |
|---|---|---|
| `uploadTicketAttachment` | **anonymous public** — assistance filing *and* resident replies | `src/lib/media.ts:237` |
| `uploadFeedbackScreenshot` | **anonymous public** — the floating feedback widget | `src/lib/media.ts:178` |
| `uploadSingleImage` | authenticated admin | `src/lib/media.ts:99` |
| document Route Handler | authenticated, `manage-transparency` | `src/app/api/admin/uploads/document/route.ts:121` |
| `attachPendingPhotos` (news photos) | authenticated admin | `src/features/admin/actions/news.ts:150` |
| `uploadAchievementPhotos` | authenticated admin | `src/features/admin/actions/achievement-photos.ts:116` |

Two findings behind that table, both verified against source rather than assumed:

- `uploadFeedbackScreenshot` is a **second anonymous upload path the backlog did not name**.
  It carries the same weakness as the ticket path and is in scope for that reason.
- **`news.ts` and `achievement-photos.ts` do *not* route through `uploadSingleImage`.** Each
  calls `admin.storage.from(bucket).upload(...)` directly with its own inline type and size
  checks, so they are independent call sites and would have been missed by a fix that only
  patched the shared helper. They are the reason this list is six rather than four.

### Explicitly not in scope

`src/lib/media-lifecycle.ts:34` re-uploads bytes it just downloaded from another bucket
(`promoteMedia`/`demoteMedia`). It is a copy of an already-validated object, not an ingest
point, and sniffing there would only re-check the app's own output.

---

## A3. Bucket-level `file_size_limit` and `allowed_mime_types`

### Change — migration `0036`

Today every bucket is created as `(id, name, public)` with no ceilings, in both
`supabase/migrations/0028_media_buckets.sql` / `0032_ticket_updates.sql` **and**
`supabase/baseline/0000_baseline_2026-07-23.sql`. The 3 × 2 MB cap exists only in app code.

Values are set to **exactly what app code already enforces**, so no legitimate upload changes
behaviour:

| Bucket(s) | `file_size_limit` | `allowed_mime_types` | Source of truth |
|---|---|---|---|
| `ticket-media` | 2 MB | pdf, png, jpeg, webp | `MAX_TICKET_FILE_BYTES`, `ALLOWED_DOC_FILE_TYPES` |
| `feedback-media` | 2 MB | png, jpeg, webp | `MAX_SCREENSHOT_BYTES`, `ALLOWED_IMAGE_TYPES` |
| `legislative-*`, `transparency-*` | 10 MB | *(not set — see below)* | `MAX_DOC_FILE_BYTES` |
| all other buckets | 2 MB | *(not set — see below)* | `MAX_IMAGE_BYTES` |

### Why `allowed_mime_types` is set on two buckets only

`promoteMedia` re-uploads with `contentType: file.type || undefined`
(`src/lib/media-lifecycle.ts:37`). When that download yields no type, Supabase sends a
default — plausibly `application/octet-stream` — which a restrictive `allowed_mime_types`
would **reject**, and `promoteMedia` fails closed. The failure mode is publishing breaking in
production, on the six status-aware bucket pairs only.

`ticket-media` and `feedback-media` have no lifecycle: nothing is ever promoted or demoted
between them, so they are pure ingest and safe to restrict. That is also exactly the pair the
backlog asked about. `file_size_limit` carries no such hazard anywhere — a promoted copy is
the same byte count as its source — so it is set everywhere.

Widening MIME restriction to the status-aware buckets is a follow-up that must first make
`promoteMedia` send an explicit `contentType`. **Not in this pass**; recorded here so the
omission is a decision rather than an oversight.

### Both files, or a fresh stand-up is unprotected

The migration updates the live buckets; the baseline must carry the same values inline so a
new environment built from `0000_baseline` is not silently unlimited. **This is precisely how
migration `0029`'s `rate_limit_hits` table was missed** — caught only by that pass's final
whole-branch review, and it would have produced a production site with zero rate limiting.
Same failure shape, same file.

### Deploy order

**None required, in either direction.** The ceilings equal what the code already enforces, so
code-before-migration and migration-before-code are both safe. This is the one item in this
pass with no ordering hazard, and it is why it can ship first.

---

## A4. Malware scanning — accepted risk, recorded

**Decision (owner, 2026-08-11): accept and document. No code.**

Rationale, to `.claude/security.md`:

- Both resident buckets are **private**, with no read policy and no public serving path — a
  stored file is reachable only through a service-role signed URL.
- Ingest is capped at **3 files × 2 MB**, and after A2 the bytes must match a declared PDF or
  image signature, which blocks the cheap disguised-executable case.
- Staff headcount is a handful of named accounts on a barangay LAN, not an open enterprise
  attack surface.
- Every option adds a network dependency to ticket filing, a recurring cost, and a
  fail-open/fail-closed decision — and ships photographs of residents' IDs to a third party,
  a privacy boundary this codebase does not currently cross and has repeatedly declined to
  (feedback screenshots, complaint narratives).

Revisit if uploads are ever served to a browser directly, or if staff begin opening
attachments outside the portal.

---

## A5. Assistance rate limiting gains a per-person dimension

### The gap

`submitAssistance` keys on `assistance:<ip>` alone (5/hour), unlike `login:email:*` or
`reply:ticket:*`. Distributed abuse is unbounded per person.

### Why not email — a flaw in the original pick, corrected

The obvious mirror of `login:email:*` is the contact email. **`residentFields.email` is
`optionalEmailField`** (`src/lib/public-forms.ts:94`) — empty string is valid and common.
Keying on it would drop every resident *without* an email into one shared
`assistance:email:` bucket, and the first five per hour would lock out all the rest.

That is the same shared-bucket flaw as `requestIp()`'s `"unknown"` fallback, aimed at exactly
the residents least likely to have email and most likely to be filing for social assistance.
Rejected on those grounds.

### Change

Key on **`contactNumber`**, which `residentFields` makes required (≥ 7 digits), so no empty
bucket can form:

```
assistance:contact:<digits-only>    5 / hour   — same budget as assistance:<ip>
```

Normalised by stripping every non-digit, so `(077) 600-1082` and `0776001082` are one bucket.
**Not** `normaliseMobile()` — that returns `null` for landlines, which would reintroduce the
empty-bucket problem for exactly the residents who call from one.

### Ordering — deliberate, and load-bearing

```
Turnstile  →  assistance:<ip>  →  Zod  →  assistance:contact:<digits>
```

The contact key is checked **after** Zod, so a malformed or absent number cannot spend
budget, and the IP key stays **first** as the cheapest rejection. This follows the rule
`.claude/security.md` already states for `reply:ticket:*`, which is checked only after the
surname gate for the same class of reason.

### Accepted trade-off

Someone who knows a resident's number can deliberately burn that number's hourly budget.
This is the identical property `login:email:*` already has for a known account, it costs the
attacker a Turnstile solve per attempt, it expires in an hour, and the barangay hall counter
remains an unaffected path. Recorded, not mitigated.

---

## Scope, sequencing and verification

### Order

1. **A3** — no deploy-order hazard; migration announced early so it can be applied while the
   rest is built.
2. **A2** — self-contained, unit-testable, no config.
3. **A1** — touches two e2e suites; land once A2's churn is done.
4. **A5** — smallest code change, depends on nothing above.
5. **A4** — documentation, folded into the same docs pass.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run test:unit` throughout.
- `npx next build` — not `npm run dev`. The services-flows pass established that a route
  silently prerendering static is visible **only** in the build's `○` vs `ƒ` markers.
- e2e: `--project=public` needs no login. `login.spec.ts` spends 6 hits against a 5-per-5-min
  budget and **collides with itself by design** — one run per window, and a second failure
  inside that window is a collision, not a regression.
- A3's ceilings are verified against the live bucket rows after the owner applies `0036`, not
  inferred from the migration text.
- A2's rejection path gets one manual browser check per public form (assistance filing,
  feedback widget) by renaming a `.txt` to `.pdf` — the sniffer's whole purpose is catching
  what the declared type misses, and no automated test in this repo exercises a real upload.

### Documentation owed in the same session

`.claude/security.md` (A1 topology, A2 sniffing, A4 rationale, A5 key + ordering),
`.claude/storage.md` (A2 call sites, A3 bucket ceilings and the `promoteMedia` constraint),
`.claude/testing.md` (the XFF forging switch), `.claude/deployment.md` (`0036`, and
`TRUSTED_IP_HEADER`), `.env.example`, and **deletion of section A from
`docs/HARDENING_BACKLOG.md`** — the file's own instruction is to delete entries as they ship.

### Out of scope

Backlog section B; MIME restriction on the six status-aware bucket pairs (blocked on
`promoteMedia`'s `contentType`); the `"unknown"` shared IP bucket, which cannot arise on
Vercel since XFF is always set.
