# Security

Standing rules from the 3-plan hardening pass
(`docs/superpowers/specs/2026-07-28-security-hardening-design.md` and the three plans
`2026-07-28-security-hardening-foundation.md`, `-turnstile.md`,
`2026-07-29-security-hardening-body-size.md` — read those for task-by-task history).
Access control is `.claude/authorization.md`; auth flows are `.claude/authentication.md`.

## Non-negotiables

1. **Never expose the service-role key to the client.** It is the entire auth gate for every
   write-bearing table (`.claude/database.md`).
2. **Every Server Action re-validates its input with Zod at runtime.** They are public HTTP
   endpoints; a browser can POST to any of them regardless of what any page links to.
3. **Free-text fields on unauthenticated endpoints carry a length cap** — that is what
   `src/lib/public-forms.ts` requires of them. A floor is a policy choice; the cap is not.
4. **A declared MIME type is a claim, not evidence.** Every upload path verifies the leading
   bytes with `sniffMimeType` before the object reaches Storage — including the two anonymous
   public paths (ticket attachments, feedback screenshots).

## Rate limiting — durable, fails **open**

`rate_limit_hits` (migration `0029`), `src/lib/rate-limit.ts`. A Supabase error lets the
request through: a limiter outage must not take the site down with it.

- `checkRateLimit` checks and records together — all 8 public forms.
- `countRateLimitHits` + `recordRateLimitHit` are split so `signIn` can read a budget
  without spending it.
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
### Every budget currently in force

Verified against source; the constants live beside their action, not in `rate-limit.ts`.

| Key | Budget | Declared in |
|---|---|---|
| `apply:<ip>` | 10 / hour | `features/services/actions.ts` |
| `appointment:<ip>`, `complaint:<ip>`, `assistance:<ip>`, `inquiry:<ip>`, `subscribe:<ip>` | 5 / hour | each feature's `actions.ts` |
| `assistance:contact:<digits>` | `CONTACT_LIMIT` 5 / hour | `features/assistance/actions.ts` |
| `feedback:<ip>` | 3 / hour | `features/feedback/actions.ts` |
| `track:<ip>` | `LOOKUP_LIMIT` 10 / 10 min | `features/track/actions.ts` |
| `reply:ip:<ip>` | `REPLY_LIMIT` 5 / hour | `features/track/actions.ts` |
| `reply:ticket:<ticket_no>` | 5 / hour | same — checked **only after** the surname gate |
| `login:ip:<ip>`, `login:email:<email>` | `LOGIN_LIMIT` 5 / `LOGIN_WINDOW_MS` 5 min | `admin/lib/login-challenge.ts` |
| `reset:ip:<ip>`, `reset:email:<email>` | `RESET_LIMIT` 3 / 15 min | `admin/actions/auth.ts` |
| `reset-submit:ip:<ip>` | 10 / 15 min | same |

`LOGIN_WINDOW_MS` also drives the adaptive CAPTCHA threshold — one knob, two effects
(`.claude/authentication.md`). Anything IP-keyed inherits `requestIp()`'s topology
assumption — see the bullet above.

- **Order matters when a limit is keyed on something guessable.** The reply path checks
  `reply:ticket:<ticket_no>` only *after* the surname gate passes: ticket numbers are
  sequential and guessable — the entire reason the surname gate exists — so checking that
  budget first would let anyone enumerate ticket numbers and burn every resident's reply
  budget without knowing a single surname.
  `submitAssistance` follows the same rule from the other direction: its IP key is checked
  before Zod as the cheapest rejection, and its **contact** key only after, so a malformed
  or absent number cannot spend budget. It keys on `contactNumber` rather than the resident's
  email because `residentFields.email` is optional — keying on a blank-able field would put
  every resident without an email into one shared bucket.

## Turnstile — fails **closed**, the opposite of the rate limiter

Gates all 8 public anonymous Server Actions (apply, track lookup, inquiry, feedback,
assistance, complaint, appointment, alert subscribe) plus `/admin/login` adaptively.
`src/lib/turnstile.ts` exports `verifyTurnstileToken(token, ip)` and
`TURNSTILE_FAILURE_MESSAGE` — **one rejection string for every failure reason**, so a script
probing a form can't learn which check it tripped.

- **Verification runs FIRST — before `checkRateLimit`, before Zod** (design spec §5), so a
  failed challenge is the cheapest possible rejection and never spends rate-limit budget.
  `/admin/login` is the one deliberate inversion (see `.claude/authentication.md`).
- A missing token, a Cloudflare-reported failure and a `siteverify` network error all
  reject. Turnstile IS the anti-bot layer, so failing open would silently disable the
  feature itself. **The one asymmetry:** a missing `TURNSTILE_SECRET_KEY` skips verification
  in development (one `console.warn`, so a contributor without a Cloudflare account isn't
  blocked) and **throws in production**, so a keyless deploy 500s rather than shipping with
  no CAPTCHA.
- **The site key is inlined at build time** — a rotation needs a rebuild, not just an env
  change and a redeploy. Error **110200** = hostname not on the site key's allow-list: what
  the real key returns on `localhost`, and equally what a key rotated without a rebuild
  looks like.
- `src/components/shared/turnstile-widget.tsx` renders through the imperative
  `window.turnstile` API rather than data-attribute auto-render, because tokens are
  single-use and every form must `reset()` after a submit without remounting and losing
  state.
- **A healthy widget and a dead one look identical** (`appearance: "interaction-only"` makes
  both a zero-height empty box), so the widget raises its own `role="alert"` banner plus a
  **Try again** button off an `unavailable` flag — the fix lives in the widget, so all call
  sites got it for free. Three things not to undo: (1) Try again bumps an `attempt` counter
  the mount effect keys on, because `window.turnstile.reset()` cannot recover a script that
  never loaded — the more common failure; (2) the success callback clears `unavailable`
  (Cloudflare self-retries via `retry: "auto"`, and a healed widget must stop accusing
  itself); (3) `expired-callback` deliberately raises nothing — an expiring token is the
  widget working. A missing site key also raises nothing: dev-only, where the server-side
  bypass keeps forms working, so there is nothing to tell the resident.

## Privacy boundaries that are enforced by one line each

- **`ticket_updates.visibility`, filtered in the query layer, is the entire gate keeping a
  staff internal note off `/track`.** `loadTimeline` (`src/features/track/actions.ts`)
  filters `.eq("visibility","public")` and the component never re-checks it. **Do not move
  that check into `ticket-timeline.tsx` "for clarity"** — that would make the guarantee
  depend on the component rendering correctly rather than on the row never being returned.
- **`author_name` is not selected into that payload.** An anonymous endpoint ships every
  column it selects whether or not anything renders it, and naming the staff member who
  handled a complaint to the reporter invites pressure on them.
- **A complaint's `narrative` and `respondent` are never echoed into an email** — only the
  incident date and location. Same "status only" restraint `TicketLookupResult` documents
  for `/track`, applied on principle even though the mail goes to the reporter's own inbox.
- **Anything threaded as a prop into a client component serializes whole into the RSC
  payload**, whether or not it renders. Coarsen server-side before the boundary: the
  appointment demand map reduces counts to `Light`/`Moderate`/`Busy` before returning, so
  page source never carries the barangay's exact 60-day volume.
- **Feedback is anonymous** — no name, email or IP stored, so no consent field, no reply
  path, no `/track` entry. Screenshots live in the private `feedback-media` bucket behind
  ten-minute signed URLs, because a screenshot can contain the sender's own account page.
- **Past the surname gate, use the DB-resolved `view.ticket_no`, never the client-submitted
  string.** It becomes a storage path prefix; the client string is an accident of the
  `.eq()` match, not a guarantee that survives the function.

## Enumeration resistance

Generic, identical responses for "exists" and "doesn't exist" — plus the time dimension.
`requestPasswordReset` is the worked example (`.claude/authentication.md`): same response
for every outcome, record-on-every-call rate limiting because differential counting is
itself a signal, and `RESET_TIMING_FLOOR_MS` because the found-active branch makes network
hops the others don't. The document-upload Route Handler follows the same rule: a missing
row returns the same generic failure as everything else, so the endpoint never answers
whether an id exists.

## CSP and remote hosts

`next.config.ts` sets a scoped CSP plus the standard security response headers
(X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy).

- **Adding a remote image host means editing `next.config.ts` twice** —
  `images.remotePatterns` AND the CSP's `img-src`, or it breaks.
- Three CSP details that look wrong and aren't: `object-src`/`frame-src` both carry `'self'
  + supabaseOrigin`, because Chrome renders the transparency `<object
  type="application/pdf">` preview through an internal frame that `frame-src` (not just
  `object-src`) governs; `img-src` carries `blob:` for client-side upload previews (feedback
  screenshot, avatar cropper, the image uploaders all mint a `blob:` URL before any network
  call), which `'self'` does not cover; `form-action 'self'` is spelled out — alongside
  `base-uri 'self'` and `frame-ancestors 'none'` — because it has **no `default-src`
  fallback**.
- **`https://challenges.cloudflare.com` is on three directives, and Turnstile needs all
  three**: `script-src` (the widget script), `frame-src` (its challenge iframe),
  `connect-src` (the widget's own XHR back to Cloudflare). Dropping any one breaks the
  CAPTCHA, not just its appearance.

## Request body size

`bodySizeLimit` is `"8mb"`, right-sized to the largest remaining Server-Action payload
(`saveNewsArticle`/`uploadAchievementPhotos` send up to 3 images inline). **Don't raise it
to fit a new feature** — it applies to every public unauthenticated form at once. Size the
feature instead: resident ticket attachments are capped at 3 files × 2 MB for exactly this
reason, and raising the limit would also have meant building an anonymous public-facing
sibling to the authenticated upload Route Handler — the largest attack surface that feature
could have added. Document PDFs moved to a Route Handler rather than raise it
(`.claude/storage.md`).

## Dependencies

`package.json`'s `overrides` block pins `postcss` and `sharp` — neither is a top-level app
dependency (one is inside `next`'s build tooling, the other an optional runtime dep of
`next/image`), so the override patches their CVEs without waiting for `next` to bump them.
One `npm audit` finding (`brace-expansion`, via ESLint 9's own chain, dev-time only) is
deliberately unfixed — `docs/BACKEND_HANDOFF.md` §6 item 12.

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
