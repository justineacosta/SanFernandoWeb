# Site Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give residents a floating button on every public page that files anonymous feedback about this website, and give staff that queue as a second tab on `/admin/inquiries`, renamed **Inquiries & Feedback**.

**Architecture:** A new `feedback` table (its own lifecycle, no PII) written by one unauthenticated Server Action using the service-role client, with screenshots in a **private** `feedback-media` bucket read back through short-lived signed URLs. The public widget is a client launcher + modal mounted once in `PublicShell`. The admin surface splits today's `InquiriesManager` into two panels behind a shared `TabPills` primitive.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 (`@theme` tokens), Supabase (Postgres + Storage), Zod **v4**, framer-motion via `motion/react`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-23-site-feedback-design.md`

## Global Constraints

- **Design tokens only.** `brand-*` (amber), `ink-*` (neutrals), `danger*`, `success*` from `src/app/globals.css`. Blue tokens are from the pre-2026-07 design and must never reappear. There is no `brand-900`.
- **Zod is v4**, not v3.
- **Motion values come from `src/lib/motion.ts`** — never inline a spring or duration. Every Motion surface wraps in `<MotionConfig reducedMotion="user">`. CSS micro-interactions use `duration-(--duration-quick)`, not Motion.
- **All tables have RLS enabled with zero policies.** The service-role client (`src/lib/supabase/admin.ts`) behind an explicit permission check in code is the entire auth gate. Never expose the service-role key to the client.
- **Server Actions are public HTTP endpoints** — every write re-validates its input with Zod at runtime, no matter what the client already checked.
- **Uploaders are pure file pickers making no network calls.** The save action uploads server-side and compensating-deletes the object if the row write fails.
- **Migrations are applied manually by the owner** against Supabase staging, then production. Never assume one is applied.
- **No component tests.** Pure functions get Vitest; behaviour is verified in the browser (Playwright) — `tests/unit` has no jsdom and no React renderer, deliberately.
- **Path alias** `@/*` → `src/*`.
- Copy rules: the nav label is exactly `Inquiries & Feedback`; the widget subtitle is exactly `Anonymous — we cannot reply`; the category labels are `General`, `Bug Report`, `Suggestion`, `Complaint`, `Praise`.
- Every task ends green on `npm run typecheck` and `npm run lint`.

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/0023_feedback.sql` | `feedback` table + enums + index + trigger, the private `feedback-media` bucket, and the `search_admin_global` replacement carrying a feedback branch |
| `src/features/feedback/data.ts` | `FEEDBACK_CATEGORIES`, `feedbackCategoryLabel`, `averageRating` — pure, unit-tested |
| `src/features/feedback/schema.ts` | the one Zod schema shared by form and action |
| `src/features/feedback/actions.ts` | `"use server"` — `submitFeedback(FormData)` |
| `src/features/feedback/components/star-rating.tsx` | the optional 1–5 control |
| `src/features/feedback/components/feedback-panel.tsx` | the modal, the form, the success state |
| `src/features/feedback/components/feedback-launcher.tsx` | the floating trigger + panel open state |
| `src/features/feedback/index.ts` | barrel |
| `src/components/ui/tab-pills.tsx` | shared `role="tablist"` pill strip |
| `src/features/admin/queries/feedback.ts` | `listFeedback()` + signed screenshot URLs |
| `src/features/admin/actions/feedback.ts` | `updateFeedback`, `deleteFeedback` |
| `src/features/admin/components/feedback-panel.tsx` | the admin queue: stats, filters, table, row actions |
| `src/features/admin/components/feedback-drawer.tsx` | one report, read-only, plus status + staff note |
| `src/features/admin/components/inbox-manager.tsx` | the thin tabbed shell |
| `src/features/admin/components/inquiries-panel.tsx` | today's `InquiriesManager` body, header removed |
| `tests/unit/feedback.test.ts` | schema boundaries, label fallback, average |
| `tests/e2e/public/feedback.spec.ts` | open, submit, validate, Escape |
| `tests/e2e/admin/inbox-tabs.spec.ts` | the two tabs render and `?tab=` lands |

**Modified**

| Path | Change |
| --- | --- |
| `src/types/index.ts` | `FeedbackCategory`, `FeedbackStatus`, `PublicFeedbackValues`, `FeedbackRow`, `FeedbackUpdateValues` |
| `src/lib/storage.ts` | `FEEDBACK_MEDIA_BUCKET`, `feedbackScreenshotPath()` |
| `src/lib/media.ts` | `uploadFeedbackScreenshot`, `removeFeedbackScreenshot`, `discardFeedbackScreenshot` |
| `src/components/layout/public-shell.tsx` | mount `<FeedbackLauncher />` |
| `src/features/admin/data.ts` | nav label → `Inquiries & Feedback` |
| `src/constants/permissions.ts` | `handle-inquiries` label → `Answer inquiries & site feedback` |
| `src/features/admin/search-modules.ts` | register the `feedback` module |
| `src/features/admin/index.ts` | export `InboxManager`, drop `InquiriesManager` |
| `src/app/admin/(portal)/inquiries/page.tsx` | load both queues + SuperAdmin flag |
| `src/app/admin/(portal)/inquiries/loading.tsx` | account for the tab strip |
| `src/features/admin/components/inquiries-manager.tsx` | **deleted** (becomes `inquiries-panel.tsx`) |

**Deliberately untouched:** `src/features/admin/components/transparency-manager.tsx` (has uncommitted edits in the working tree; migrating it onto `TabPills` is a separate follow-up), `src/features/contact/*` (the inquiry form is unchanged), `tests/unit/admin-nav.test.ts` (its `ITEMS` are a **local fixture**, not `ADMIN_NAV_ITEMS`, so the label rename cannot break it — verified).

---

## Task 1: Migration, types, and storage constants

Nothing runs yet. This task exists on its own because the owner must start applying the migration while later tasks are still being written.

**Files:**
- Create: `supabase/migrations/0023_feedback.sql`
- Modify: `src/types/index.ts` (append at end of file)
- Modify: `src/lib/storage.ts` (append at end of file)

**Interfaces:**
- Consumes: nothing.
- Produces: types `FeedbackCategory`, `FeedbackStatus`, `PublicFeedbackValues`, `FeedbackRow`, `FeedbackUpdateValues`; constants `FEEDBACK_MEDIA_BUCKET`, `MAX_SCREENSHOT_BYTES`; function `feedbackScreenshotPath(ext: string): string`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0023_feedback.sql`:

```sql
-- Site feedback (sub-project 10).
--
-- /contact is for barangay business: it demands a name, an email and a Data
-- Privacy Act consent tick, and its subject list is about documents and
-- assistance. A resident with a note about a dead download link had no channel
-- that fit. This is that channel.
--
-- Anonymous by design: no name, no email, no account link, and the caller's IP
-- is used to rate-limit but never stored. That removes the DPA consent question
-- entirely — there is no personal data here to consent to the processing of.
-- The accepted cost is that staff can never follow up on a report.
--
-- RLS: enabled with NO policies, like every other table. Writes arrive from an
-- unauthenticated Server Action using the service-role client with Zod
-- validation and a rate limit; reads go through
-- requirePermission("handle-inquiries") — the same gate as the inquiry inbox,
-- because the same people work both queues.

create type public.feedback_category as enum ('general', 'bug', 'feature', 'complaint', 'praise');

-- Deliberately NOT the inquiry_status enum. 'answered' would be a lie on a row
-- nobody can answer. These four values are already carried by StatusChip's
-- label and tone maps, so the admin chip needs no edit.
create type public.feedback_status as enum ('new', 'in_progress', 'resolved', 'dismissed');

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  category public.feedback_category not null default 'general',
  subject text not null,
  message text not null,
  -- Null means "not given". The rating is optional, and storing 0 for
  -- "unrated" would drag every average down.
  rating smallint check (rating between 1 and 5),
  -- The page the resident was on when they opened the widget. Path only, never
  -- the query string: a path is context, a query string can carry a token or
  -- something the resident typed into a search box.
  page_path text not null default '',
  -- `feedback/<uuid>.<ext>` in the private feedback-media bucket, or null.
  screenshot_path text,
  status public.feedback_status not null default 'new',
  -- Internal triage note. Never sent anywhere — there is no address to send to.
  staff_note text not null default '',
  -- Nullable, ON DELETE SET NULL: deleting a staff account must not delete the
  -- report. The audit log holds the durable record of who did what.
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The queue is worked newest-first and filtered by status, which is this index.
create index feedback_status_created_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- ── Storage: PRIVATE feedback-media bucket ──────────────────────────────────
-- Unlike public-media and public-documents, this bucket is private. A
-- screenshot of the page a resident was looking at can contain their own
-- account page, their ticket, or their name; a public bucket would leave that
-- readable by anyone holding the URL, forever. There is deliberately NO read
-- policy: the service-role client is the only reader and it mints a short-lived
-- signed URL per page load.
insert into storage.buckets (id, name, public)
  values ('feedback-media', 'feedback-media', false)
  on conflict (id) do nothing;

-- ── Global admin search: add the feedback branch ────────────────────────────
-- Unchanged from 0018 except for the final union, so a hit on a feedback
-- subject lands on the right tab. p_modules remains the entire authorization
-- surface; the caller builds it from checkPermission() results only.
create or replace function public.search_admin_global(
  p_q       text,
  p_modules text[],
  p_limit   int default 5
)
returns table (
  module    text,
  record_id text,
  label     text,
  sublabel  text,
  status    text
)
language sql
stable
as $$
  ( select 'news'::text, a.id::text, a.title,
           coalesce(c.label, '')::text, a.status::text
    from public.news_articles a
    left join public.news_categories c on c.id = a.category_id
    where 'news' = any (p_modules)
      and public.fuzzy_match(a.title || ' ' || coalesce(c.label, ''), p_q)
    order by a.updated_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'announcements'::text, n.id::text, n.title, ''::text, n.status::text
    from public.announcements n
    where 'announcements' = any (p_modules)
      and public.fuzzy_match(n.title, p_q)
    order by n.updated_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'events'::text, e.id::text, e.title, e.venue, e.status::text
    from public.events e
    where 'events' = any (p_modules)
      and public.fuzzy_match(e.title || ' ' || e.venue, p_q)
    order by e.event_date desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'officials'::text, o.id::text, o.name, o.role, o.status::text
    from public.officials o
    where 'officials' = any (p_modules)
      and public.fuzzy_match(o.name || ' ' || o.role, p_q)
    order by o.sort_order
    limit greatest(p_limit, 1) )
  union all
  ( select 'services'::text, s.id::text, s.title, s.department,
           (case when s.is_available then 'active' else 'inactive' end)::text
    from public.services s
    where 'services' = any (p_modules)
      and public.fuzzy_match(s.title || ' ' || s.department, p_q)
    order by s.sort_order
    limit greatest(p_limit, 1) )
  union all
  ( select 'legislative'::text, l.id::text, l.number || ' — ' || l.title,
           l.doc_type::text, l.status::text
    from public.legislative_documents l
    where 'legislative' = any (p_modules)
      and public.fuzzy_match(l.number || ' ' || l.title || ' ' || coalesce(l.summary, ''), p_q)
    order by l.date_approved desc nulls first
    limit greatest(p_limit, 1) )
  union all
  ( select 'documents'::text, d.id::text, d.title,
           coalesce(tc.label, '')::text, d.status::text
    from public.transparency_documents d
    left join public.transparency_categories tc on tc.id = d.category_id
    where 'documents' = any (p_modules)
      and public.fuzzy_match(d.title || ' ' || coalesce(tc.label, ''), p_q)
    order by d.date_released desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'projects'::text, p.id::text, p.name,
           (p.progress::text || '% complete'), p.status::text
    from public.transparency_projects p
    where 'projects' = any (p_modules)
      and public.fuzzy_match(p.name, p_q)
    order by p.sort_order
    limit greatest(p_limit, 1) )
  union all
  ( select 'applications'::text, ap.id::text, ap.ticket_no,
           (ap.first_name || ' ' || ap.last_name), ap.status
    from public.applications ap
    where 'applications' = any (p_modules)
      and public.fuzzy_match(
            ap.ticket_no || ' ' || ap.first_name || ' ' || ap.last_name || ' ' ||
            ap.contact_number || ' ' || coalesce(ap.email, '') || ' ' || ap.purpose,
            p_q)
    order by ap.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'appointments'::text, apt.id::text, apt.ticket_no,
           (apt.first_name || ' ' || apt.last_name), apt.status
    from public.appointments apt
    where 'appointments' = any (p_modules)
      and public.fuzzy_match(
            apt.ticket_no || ' ' || apt.first_name || ' ' || apt.last_name || ' ' ||
            apt.contact_number || ' ' || coalesce(apt.email, '') || ' ' || apt.purpose,
            p_q)
    order by apt.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'complaints'::text, cm.id::text, cm.ticket_no,
           (cm.first_name || ' ' || cm.last_name), cm.status
    from public.complaints cm
    where 'complaints' = any (p_modules)
      and public.fuzzy_match(
            cm.ticket_no || ' ' || cm.first_name || ' ' || cm.last_name || ' ' ||
            cm.contact_number || ' ' || coalesce(cm.email, '') || ' ' ||
            coalesce(cm.respondent, '') || ' ' || cm.location,
            p_q)
    order by cm.created_at desc
    limit greatest(p_limit, 1) )
  union all
  ( select 'assistance'::text, ar.id::text, ar.ticket_no,
           (ar.first_name || ' ' || ar.last_name), ar.status
    from public.assistance_requests ar
    left join public.assistance_categories ac on ac.id = ar.category_id
    where 'assistance' = any (p_modules)
      and public.fuzzy_match(
            ar.ticket_no || ' ' || ar.first_name || ' ' || ar.last_name || ' ' ||
            ar.contact_number || ' ' || coalesce(ar.email, '') || ' ' ||
            coalesce(ac.label, ''),
            p_q)
    order by ar.created_at desc
    limit greatest(p_limit, 1) )
  union all
  -- Feedback has no ticket number and no name: the subject is the label and the
  -- category is the sublabel.
  ( select 'feedback'::text, f.id::text, f.subject, f.category::text, f.status::text
    from public.feedback f
    where 'feedback' = any (p_modules)
      and public.fuzzy_match(f.subject || ' ' || f.message, p_q)
    order by f.created_at desc
    limit greatest(p_limit, 1) );
$$;

revoke execute on function public.search_admin_global(text, text[], int)
  from public, anon, authenticated;
```

- [ ] **Step 2: Append the types**

At the **end** of `src/types/index.ts`:

```ts
/**
 * Site feedback (sub-project 10) — about this website, not barangay business.
 *
 * Anonymous by design: nothing here identifies the sender, which is why there
 * is no consent field and no reply path. `/contact` remains the channel for
 * anything a resident needs an answer to.
 */
export type FeedbackCategory = "general" | "bug" | "feature" | "complaint" | "praise";

/**
 * Four states, all of which StatusChip already labels and tones. `answered`
 * would be a lie: nobody can answer a row with no address on it.
 */
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "dismissed";

/** The widget's body. The screenshot travels separately, in FormData. */
export interface PublicFeedbackValues {
  category: FeedbackCategory;
  subject: string;
  message: string;
  /** 0 means "not rated" — stored as null. */
  rating: number;
  /** The path the widget was opened on, e.g. "/transparency". Never a query string. */
  pagePath: string;
}

/** A queue row for the admin panel: flat and serializable. */
export interface FeedbackRow {
  id: string;
  category: FeedbackCategory;
  /** Display label, resolved against FEEDBACK_CATEGORIES. */
  categoryLabel: string;
  subject: string;
  message: string;
  rating: number | null;
  pagePath: string;
  /**
   * A signed URL valid for ten minutes, or null when no screenshot was
   * attached (or signing failed). The bucket is private, so there is no stable
   * public URL to store.
   */
  screenshotUrl: string | null;
  status: FeedbackStatus;
  staffNote: string;
  /** Resolved through `handled_by`; null once the account is gone. */
  handledByName: string | null;
  /** Manila calendar dates (YYYY-MM-DD). */
  handledAt: string | null;
  submittedAt: string;
}

/** The triage drawer's save body. */
export interface FeedbackUpdateValues {
  status: FeedbackStatus;
  staffNote: string;
}
```

`FeedbackStatus`'s four members are already in the `AdminStatus` union, so **do not edit `AdminStatus`** and do not touch `status-chip.tsx`.

- [ ] **Step 3: Append the storage constants**

At the **end** of `src/lib/storage.ts`:

```ts
/**
 * Feedback screenshots. A PRIVATE bucket, unlike the two above: a screenshot of
 * the page a resident was on can contain their own account or ticket. There is
 * no `feedbackScreenshotUrl()` helper for the same reason — every read has to
 * mint a short-lived signed URL through the admin client, which is why signing
 * lives in `features/admin/queries/feedback.ts` and not here.
 */
export const FEEDBACK_MEDIA_BUCKET = "feedback-media";

/** Same ceiling as every other image on the site. */
export const MAX_SCREENSHOT_BYTES = MAX_IMAGE_BYTES;

/** Storage object path for a feedback screenshot: `feedback/<uuid>.<ext>`. */
export function feedbackScreenshotPath(ext: string): string {
  return `feedback/${crypto.randomUUID()}.${ext}`;
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. No test yet — nothing is callable.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0023_feedback.sql src/types/index.ts src/lib/storage.ts
git commit -m "feat(feedback): add the feedback table, private bucket and types"
```

- [ ] **Step 6: Tell the owner to apply the migration**

State plainly in the task report: **`0023_feedback.sql` must be applied manually to Supabase staging before Task 4's action or Task 10's query can work.** It queues behind `0012`–`0022`, still pending on production. It creates its own bucket — no dashboard step, no script to run. Do not claim any later task is verified end-to-end until the owner confirms it is applied.

---

## Task 2: Pure feedback data and schema (TDD)

**Files:**
- Create: `src/features/feedback/data.ts`
- Create: `src/features/feedback/schema.ts`
- Test: `tests/unit/feedback.test.ts`

**Interfaces:**
- Consumes: `FeedbackCategory`, `FeedbackRow` from Task 1.
- Produces: `FEEDBACK_CATEGORIES` (readonly array of `{ value: FeedbackCategory; label: string; icon: LucideIcon }`), `FEEDBACK_CATEGORY_VALUES: readonly string[]`, `feedbackCategoryLabel(value: string): string`, `averageRating(rows: Pick<FeedbackRow, "rating">[]): number | null`, `feedbackSchema` (Zod object over `PublicFeedbackValues`), `MAX_FEEDBACK_MESSAGE = 1000`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/feedback.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FEEDBACK_CATEGORIES, averageRating, feedbackCategoryLabel } from "@/features/feedback/data";
import { feedbackSchema } from "@/features/feedback/schema";

/**
 * The pure half of the feedback widget.
 *
 * The schema matters most: it is the same object the Server Action validates
 * with, so a boundary that is wrong here is wrong at the only gate this
 * unauthenticated endpoint has.
 */

const VALID = {
  category: "bug" as const,
  subject: "Download link is dead",
  message: "The 2025 budget PDF returns a 404 when I tap it.",
  rating: 0,
  pagePath: "/transparency",
};

describe("feedbackSchema", () => {
  it("accepts a complete report", () => {
    expect(feedbackSchema.safeParse(VALID).success).toBe(true);
  });

  it("accepts a report with no rating (0 means unrated)", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: 0 }).success).toBe(true);
  });

  it("rejects a subject under 4 characters and accepts 4", () => {
    expect(feedbackSchema.safeParse({ ...VALID, subject: "abc" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, subject: "abcd" }).success).toBe(true);
  });

  it("rejects a subject over 120 characters and accepts 120", () => {
    expect(feedbackSchema.safeParse({ ...VALID, subject: "a".repeat(121) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, subject: "a".repeat(120) }).success).toBe(true);
  });

  it("rejects a message under 10 characters and accepts 10", () => {
    expect(feedbackSchema.safeParse({ ...VALID, message: "too short" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, message: "just right" }).success).toBe(true);
  });

  it("rejects a message over 1000 characters and accepts 1000", () => {
    expect(feedbackSchema.safeParse({ ...VALID, message: "a".repeat(1001) }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, message: "a".repeat(1000) }).success).toBe(true);
  });

  it("rejects a rating outside 0–5", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: -1 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, rating: 6 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, rating: 5 }).success).toBe(true);
  });

  it("rejects a rating that is not a whole number", () => {
    expect(feedbackSchema.safeParse({ ...VALID, rating: 3.5 }).success).toBe(false);
  });

  it("rejects a category outside the enum", () => {
    expect(feedbackSchema.safeParse({ ...VALID, category: "rant" }).success).toBe(false);
  });

  it("rejects a page path that is not a rooted path", () => {
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "https://evil.test" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "transparency" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...VALID, pagePath: "/" }).success).toBe(true);
  });

  it("trims the subject and message before measuring them", () => {
    const parsed = feedbackSchema.safeParse({ ...VALID, subject: "  Dead link  " });
    expect(parsed.success && parsed.data.subject).toBe("Dead link");
    expect(feedbackSchema.safeParse({ ...VALID, message: `  ${"a".repeat(9)}  ` }).success).toBe(false);
  });
});

describe("feedbackCategoryLabel", () => {
  it("resolves every declared category", () => {
    for (const category of FEEDBACK_CATEGORIES) {
      expect(feedbackCategoryLabel(category.value)).toBe(category.label);
    }
  });

  it("falls back to the raw value so a renamed category does not blank an old row", () => {
    expect(feedbackCategoryLabel("retired-category")).toBe("retired-category");
  });
});

describe("averageRating", () => {
  it("is null with no rows at all", () => {
    expect(averageRating([])).toBeNull();
  });

  it("is null when no row carries a rating", () => {
    expect(averageRating([{ rating: null }, { rating: null }])).toBeNull();
  });

  it("ignores unrated rows rather than counting them as zero", () => {
    expect(averageRating([{ rating: 4 }, { rating: null }, { rating: 5 }])).toBe(4.5);
  });

  it("rounds to one decimal place", () => {
    expect(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toBe(4.3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:unit -- feedback`
Expected: FAIL — `Cannot find module '@/features/feedback/data'`.

- [ ] **Step 3: Write `data.ts`**

Create `src/features/feedback/data.ts`:

```ts
import { Bug, Frown, Heart, Lightbulb, MessageSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FeedbackCategory, FeedbackRow } from "@/types";

/**
 * The five categories the widget offers.
 *
 * "Suggestion" rather than "Feature Request": a resident is not filing against
 * a backlog. Stored as an enum in Postgres, so adding one is a migration —
 * unlike INQUIRY_SUBJECTS, which is text precisely so the barangay can extend
 * it. The trade is deliberate: these five describe kinds of feedback about
 * software, which is a fixed list, not barangay business, which is not.
 */
export const FEEDBACK_CATEGORIES: readonly {
  value: FeedbackCategory;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "general", label: "General", icon: MessageSquare },
  { value: "bug", label: "Bug Report", icon: Bug },
  { value: "feature", label: "Suggestion", icon: Lightbulb },
  { value: "complaint", label: "Complaint", icon: Frown },
  { value: "praise", label: "Praise", icon: Heart },
];

export const FEEDBACK_CATEGORY_VALUES: readonly string[] = FEEDBACK_CATEGORIES.map(
  (category) => category.value,
);

/**
 * Display label for a stored category. Falls back to the raw value, mirroring
 * `inquirySubjectLabel`, so a row written before a rename still shows something.
 */
export function feedbackCategoryLabel(value: string): string {
  return FEEDBACK_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

/**
 * Mean rating over the rows that carry one, to one decimal place, or null when
 * none do.
 *
 * Unrated rows are excluded rather than counted as zero — the field is optional,
 * and treating "did not say" as "one star" would make the stat card lie in the
 * one direction that matters.
 */
export function averageRating(rows: Pick<FeedbackRow, "rating">[]): number | null {
  const rated = rows.filter((row): row is { rating: number } => typeof row.rating === "number");
  if (rated.length === 0) return null;
  const total = rated.reduce((sum, row) => sum + row.rating, 0);
  return Math.round((total / rated.length) * 10) / 10;
}
```

- [ ] **Step 4: Write `schema.ts`**

Create `src/features/feedback/schema.ts`:

```ts
import { z } from "zod";
import { FEEDBACK_CATEGORY_VALUES } from "./data";

/** The message ceiling, also enforced by the panel's live counter. */
export const MAX_FEEDBACK_MESSAGE = 1000;

/**
 * Shared by `actions.ts` (the authority) and `feedback-panel.tsx`, which uses it
 * to show the same message before spending a round trip.
 *
 * The screenshot is deliberately absent: `File` state lives outside the values
 * object, as in every other uploader here, and the action checks the file
 * separately. Do not "fix" this by adding a file field.
 */
export const feedbackSchema = z.object({
  category: z.enum(["general", "bug", "feature", "complaint", "praise"]),
  subject: z
    .string()
    .trim()
    .min(4, "Give this a short title.")
    .max(120, "Please keep the title under 120 characters."),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more so we can act on it.")
    .max(MAX_FEEDBACK_MESSAGE, `Please keep the message under ${MAX_FEEDBACK_MESSAGE} characters.`),
  // 0 is "not rated" across the client boundary; the action stores null.
  rating: z
    .number()
    .int("Choose a whole number of stars.")
    .min(0, "Choose between one and five stars.")
    .max(5, "Choose between one and five stars."),
  // Captured, never typed. Rooted-path only: anything else arriving here was
  // not produced by the widget.
  pagePath: z
    .string()
    .max(200)
    .refine((value) => value.startsWith("/"), "Invalid page reference."),
});
```

Note for the implementer: `FEEDBACK_CATEGORY_VALUES` is imported but the enum is spelled out literally, because `z.enum` needs a literal tuple to infer `FeedbackCategory`. Keep the import only if you use it — if ESLint flags it as unused, **delete the import** rather than silencing the rule.

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit -- feedback`
Expected: PASS, 17 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/feedback/data.ts src/features/feedback/schema.ts tests/unit/feedback.test.ts
git commit -m "feat(feedback): add categories, the shared schema and their tests"
```

---

## Task 3: Screenshot upload helpers

**Files:**
- Modify: `src/lib/media.ts` (append after `discardImage`)

**Interfaces:**
- Consumes: `FEEDBACK_MEDIA_BUCKET`, `MAX_SCREENSHOT_BYTES`, `feedbackScreenshotPath` from Task 1; `ALLOWED_IMAGE_TYPES`, `extForType` (already in `storage.ts`); `UploadResult`, `ActionResult` (already in `media.ts`).
- Produces: `uploadFeedbackScreenshot(file: File): Promise<UploadResult>` (its `url` is always `null` — the bucket is private), `removeFeedbackScreenshot(path: string): Promise<ActionResult>`, `discardFeedbackScreenshot(path: string | null, context: string): Promise<void>`.

- [ ] **Step 1: Append the helpers**

At the **end** of `src/lib/media.ts`:

```ts
/**
 * Upload one feedback screenshot into the private bucket.
 *
 * A separate function from `uploadSingleImage` rather than a new `ImageFolder`:
 * that helper writes to `public-media` and returns a public URL, and neither is
 * true here. `url` comes back null on purpose — a private object has no stable
 * URL, and the admin queue signs one per page load.
 *
 * As with every uploader here, persisting the returned `src` is the caller's
 * job, and so is deleting the object if the row write then fails.
 */
export async function uploadFeedbackScreenshot(file: File): Promise<UploadResult> {
  if (file.size === 0) return { error: "Choose an image.", src: null, url: null };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return { error: "Screenshots must be JPG, PNG, or WebP.", src: null, url: null };
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return { error: "The screenshot must be 2 MB or smaller.", src: null, url: null };
  }

  const path = feedbackScreenshotPath(extForType(file.type));
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage
    .from(FEEDBACK_MEDIA_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) return { error: "Upload failed. Try again.", src: null, url: null };

  return { error: null, src: path, url: null };
}

/**
 * Delete a feedback screenshot. `removeStoredImage`'s allow-list is
 * public-media-specific, so this keeps its own — `feedback/` is the only prefix
 * this module ever writes into that bucket, and an arbitrary string must never
 * reach storage.remove().
 */
export async function removeFeedbackScreenshot(path: string): Promise<ActionResult> {
  if (!/^feedback\//.test(path)) return { error: "That screenshot cannot be removed." };
  if (path.split("/").some((segment) => segment === "..")) {
    return { error: "That screenshot cannot be removed." };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.storage.from(FEEDBACK_MEDIA_BUCKET).remove([path]);
  if (error) return { error: "Could not remove the screenshot." };
  return { error: null };
}

/** Best-effort cleanup, mirroring `discardImage`: logs an orphan, never throws. */
export async function discardFeedbackScreenshot(
  path: string | null,
  context: string,
): Promise<void> {
  if (!path) return;
  const { error } = await removeFeedbackScreenshot(path);
  if (error) console.error(`Orphaned screenshot (${context}): ${path}`);
}
```

- [ ] **Step 2: Extend the import block at the top of the same file**

The existing import from `@/lib/storage` becomes:

```ts
import {
  ALLOWED_IMAGE_TYPES,
  FEEDBACK_MEDIA_BUCKET,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  PUBLIC_MEDIA_BUCKET,
  extForType,
  feedbackScreenshotPath,
  photoUrl,
} from "@/lib/storage";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. No unit test: this module talks to Supabase, and `tests/unit` covers pure functions only.

- [ ] **Step 4: Commit**

```bash
git add src/lib/media.ts
git commit -m "feat(feedback): add private-bucket screenshot upload and cleanup helpers"
```

---

## Task 4: The submit action

**Files:**
- Create: `src/features/feedback/actions.ts`

**Interfaces:**
- Consumes: `feedbackSchema` (Task 2), `uploadFeedbackScreenshot` / `discardFeedbackScreenshot` (Task 3), `checkRateLimit` / `requestIp` from `@/lib/rate-limit`, `createSupabaseAdminClient` from `@/lib/supabase/admin`, `ALLOWED_IMAGE_TYPES` / `MAX_SCREENSHOT_BYTES` from `@/lib/storage`, `SITE` from `@/constants/site`.
- Produces: `submitFeedback(form: FormData): Promise<SubmitFeedbackResult>` where `SubmitFeedbackResult = { error: string | null }`.

- [ ] **Step 1: Write the action**

Create `src/features/feedback/actions.ts`:

```ts
"use server";

import { SITE } from "@/constants/site";
import { checkRateLimit, requestIp } from "@/lib/rate-limit";
import { discardFeedbackScreenshot, uploadFeedbackScreenshot } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_IMAGE_TYPES, MAX_SCREENSHOT_BYTES } from "@/lib/storage";
import { feedbackSchema } from "./schema";

export interface SubmitFeedbackResult {
  error: string | null;
}

/**
 * Tighter than the inquiry form's five per hour. A note about the website is
 * rarer than a question about a certificate, and this endpoint accepts a file
 * upload from nobody in particular — the budget is the only thing standing
 * between the bucket and a script.
 */
const SUBMIT_LIMIT = 3;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Anonymous feedback about this website.
 *
 * `FormData` rather than a values object because a `File` has to travel. No
 * auth: `feedback` has no RLS policies at all, so this action IS the gate —
 * everything is validated here and nothing is read back out.
 *
 * There is no ticket number in the result, for the same reason `submitInquiry`
 * has none: handing back a reference that nothing can look up is a lie in a new
 * shape. Nothing is revalidated either — no page renders feedback.
 */
export async function submitFeedback(form: FormData): Promise<SubmitFeedbackResult> {
  // Before parsing, so a flood costs one map lookup rather than a file read.
  const ip = await requestIp();
  if (!checkRateLimit(`feedback:${ip}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS)) {
    return {
      error: `Too much feedback from this connection. Please try again later, or call ${SITE.phone}.`,
    };
  }

  const parsed = feedbackSchema.safeParse({
    category: form.get("category"),
    subject: form.get("subject"),
    message: form.get("message"),
    rating: Number(form.get("rating") ?? 0),
    pagePath: form.get("pagePath") ?? "/",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  // The client already refused an oversized or wrong-typed file. It is a client:
  // this is the check that counts.
  const picked = form.get("screenshot");
  const file = picked instanceof File && picked.size > 0 ? picked : null;
  if (file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { error: "Screenshots must be JPG, PNG, or WebP." };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { error: "The screenshot must be 2 MB or smaller." };
    }
  }

  let screenshotPath: string | null = null;
  if (file) {
    const upload = await uploadFeedbackScreenshot(file);
    if (upload.error) return { error: upload.error };
    screenshotPath = upload.src;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("feedback").insert({
    category: parsed.data.category,
    subject: parsed.data.subject,
    message: parsed.data.message,
    // 0 crosses the boundary as "not rated"; the column stores null so it
    // stays out of every average.
    rating: parsed.data.rating === 0 ? null : parsed.data.rating,
    page_path: parsed.data.pagePath,
    screenshot_path: screenshotPath,
  });
  if (error) {
    // Compensating delete: without this the object outlives the row that was
    // supposed to reference it, which is exactly the orphan the deferred-upload
    // rule exists to prevent.
    await discardFeedbackScreenshot(screenshotPath, "submitFeedback insert failed");
    console.error("submitFeedback failed:", error.message);
    return { error: "We could not send your feedback. Please try again." };
  }

  return { error: null };
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/feedback/actions.ts
git commit -m "feat(feedback): add the anonymous submit action with compensating delete"
```

---

## Task 5: The star rating control

**Files:**
- Create: `src/features/feedback/components/star-rating.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `<StarRating value={number} onChange={(next: number) => void} />` where `0` means unrated.

- [ ] **Step 1: Write the component**

Create `src/features/feedback/components/star-rating.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  /** 1–5, or 0 for "not rated". */
  value: number;
  onChange: (next: number) => void;
  /** Ids the group's own label, so the radiogroup is named. */
  labelledBy: string;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * The optional "overall experience" control.
 *
 * A real `radiogroup`, not five buttons: arrow keys have to work, and a screen
 * reader should hear one control with five options rather than five unrelated
 * toggles. Clicking the current value clears it back to unrated — the field is
 * optional, so a mis-click must be undoable without reloading the form.
 *
 * Hover state is local because it is presentation, not data: the filled count
 * follows the pointer, but `value` only changes on a click.
 */
export function StarRating({ value, onChange, labelledBy }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const shown = hovered || value;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onChange(Math.max(0, (value || 0) - 1));
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHovered(0)}
      className="flex items-center gap-1"
    >
      {STARS.map((star) => {
        const filled = star <= shown;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={star === 1 ? "1 star" : `${star} stars`}
            // Only the selected star — or the first, when nothing is selected —
            // is in the tab order, so Tab crosses the group once.
            tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
            onClick={() => onChange(value === star ? 0 : star)}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            className="rounded-full p-1 transition-colors duration-(--duration-quick) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <Star
              className={cn(
                "h-6 w-6 transition-colors duration-(--duration-quick)",
                filled ? "fill-brand-500 text-brand-500" : "text-ink-300",
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
      {value > 0 ? (
        <span className="ml-2 text-sm text-ink-500">
          {value} of 5
        </span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. No component test — repo rule; behaviour is covered by the Playwright spec in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/features/feedback/components/star-rating.tsx
git commit -m "feat(feedback): add the optional star rating radiogroup"
```

---

## Task 6: The feedback panel (modal + form)

**Files:**
- Create: `src/features/feedback/components/feedback-panel.tsx`

**Interfaces:**
- Consumes: `feedbackSchema` + `MAX_FEEDBACK_MESSAGE` (Task 2), `submitFeedback` (Task 4), `StarRating` (Task 5), `FEEDBACK_CATEGORIES` (Task 2), `useFieldValidation` from `@/hooks/use-field-validation`, `Button`, `Field`, `Input`, `Textarea` from the UI primitives, `FADE_QUICK` / `POP` from `@/lib/motion`, `ALLOWED_IMAGE_TYPES` / `MAX_SCREENSHOT_BYTES` / `formatFileSize` from `@/lib/storage`.
- Produces: `<FeedbackPanel open={boolean} onClose={() => void} />`.

Structural reference: `src/components/ui/confirm-dialog.tsx` already solved the modal mechanics (scrim + panel under `AnimatePresence`, focus trap, Escape, scroll lock, focus restore). Follow it; do not invent a second approach.

- [ ] **Step 1: Write the component**

Create `src/features/feedback/components/feedback-panel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CheckCircle2, ImageUp, MessageSquarePlus, Send, X } from "lucide-react";
import type { FeedbackCategory, PublicFeedbackValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useFieldValidation } from "@/hooks/use-field-validation";
import { FADE_QUICK, POP } from "@/lib/motion";
import { ALLOWED_IMAGE_TYPES, MAX_SCREENSHOT_BYTES, formatFileSize } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { submitFeedback } from "@/features/feedback/actions";
import { FEEDBACK_CATEGORIES } from "@/features/feedback/data";
import { MAX_FEEDBACK_MESSAGE, feedbackSchema } from "@/features/feedback/schema";
import { StarRating } from "./star-rating";

interface FeedbackPanelProps {
  open: boolean;
  onClose: () => void;
}

const EMPTY: Omit<PublicFeedbackValues, "pagePath"> = {
  category: "general",
  subject: "",
  message: "",
  rating: 0,
};

/**
 * The feedback dialog.
 *
 * Mechanics are lifted from ConfirmDialog rather than reinvented: scrim and
 * panel inside one AnimatePresence, focus trapped while open, Escape to close,
 * body scroll locked, focus restored on unmount. `role="dialog"` and not
 * `alertdialog` — this interrupts nothing and decides nothing.
 *
 * The subtitle says "Anonymous — we cannot reply" rather than the reference
 * design's "No account needed". Both are true; only one of them is the fact a
 * resident needs before typing, since they would otherwise wait for an answer
 * that cannot come.
 */
export function FeedbackPanel({ open, onClose }: FeedbackPanelProps) {
  const pathname = usePathname();
  const [values, setValues] = useState(EMPTY);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const pendingRef = useRef(pending);
  // `pending` only flips once React commits, so the disabled button alone
  // cannot stop two clicks landing in the same tick.
  const submitting = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    pendingRef.current = pending;
  });

  const withPath: PublicFeedbackValues = { ...values, pagePath: pathname || "/" };
  const v = useFieldValidation(feedbackSchema, withPath);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  // Reset only on a fresh open, so a mis-click on the scrim mid-typing does not
  // erase what someone wrote — reopening restores it.
  useEffect(() => {
    if (open && sent) {
      setValues(EMPTY);
      clearScreenshot();
      setSent(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // An object URL is a document-lifetime handle; without this the blob leaks.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function clearScreenshot() {
    setScreenshot(null);
    setFileError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * A pure picker: no network call happens here. The file is held in state and
   * uploaded by the action on Save, so an object can only exist once a row
   * references it.
   */
  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      clearScreenshot();
      setFileError("Screenshots must be JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      clearScreenshot();
      setFileError("The screenshot must be 2 MB or smaller.");
      return;
    }
    setFileError(null);
    setScreenshot(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    if (!v.revealAll(event.currentTarget as HTMLFormElement)) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("category", values.category);
      form.set("subject", values.subject);
      form.set("message", values.message);
      form.set("rating", String(values.rating));
      form.set("pagePath", withPath.pagePath);
      if (screenshot) form.set("screenshot", screenshot);
      const result = await submitFeedback(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="feedback"
            className="fixed inset-0 z-70 flex items-end justify-center sm:items-center sm:p-4"
          >
            <motion.div
              aria-hidden="true"
              onClick={() => (pending ? undefined : onClose())}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_QUICK}
              className="absolute inset-0 bg-ink-950/50"
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={POP}
              className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-floating sm:max-h-[90vh] sm:rounded-3xl"
            >
              <div className="flex items-start gap-4 border-b border-ink-200/70 p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <MessageSquarePlus className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="feedback-title"
                    className="font-display text-lg font-semibold tracking-tight text-ink-900"
                  >
                    Send Feedback
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-500">Anonymous &mdash; we cannot reply</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  aria-label="Close feedback"
                  className="rounded-full p-2 text-ink-500 transition-colors duration-(--duration-quick) hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {sent ? (
                <div className="p-6">
                  <CheckCircle2 className="mb-4 h-12 w-12 text-brand-500" aria-hidden="true" />
                  <h3 className="mb-2 font-display text-xl font-bold text-ink-900">
                    Thank you &mdash; this reached the barangay
                  </h3>
                  <p className="mb-6 text-sm text-ink-600">
                    Staff review feedback about the website regularly. Because this was sent
                    anonymously there is no reply coming, and nothing to track. If you need an
                    answer, use the contact form instead.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setValues(EMPTY);
                        clearScreenshot();
                        setSent(false);
                      }}
                    >
                      Send another
                    </Button>
                    <Button variant="ghost" onClick={onClose}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-ink-700">Category</legend>
                      <div role="radiogroup" aria-label="Feedback category" className="flex flex-wrap gap-2">
                        {FEEDBACK_CATEGORIES.map((category) => {
                          const Icon = category.icon;
                          const selected = values.category === category.value;
                          return (
                            <button
                              key={category.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => set("category", category.value as FeedbackCategory)}
                              className={cn(
                                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-(--duration-quick)",
                                selected
                                  ? "border-brand-500 bg-brand-500 text-ink-900"
                                  : "border-ink-200/70 text-ink-600 hover:bg-ink-50",
                              )}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                              {category.label}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <Field label="Subject" htmlFor="feedback-subject" error={v.errorFor("subject")}>
                      <Input
                        id="feedback-subject"
                        name="subject"
                        placeholder="Brief summary of your feedback"
                        value={values.subject}
                        onChange={(event) => set("subject", event.target.value)}
                        {...v.fieldProps("subject", "feedback-subject")}
                      />
                    </Field>

                    <Field label="Message" htmlFor="feedback-message" error={v.errorFor("message")}>
                      <Textarea
                        id="feedback-message"
                        name="message"
                        rows={4}
                        maxLength={MAX_FEEDBACK_MESSAGE}
                        placeholder="What happened, and on which page?"
                        value={values.message}
                        onChange={(event) => set("message", event.target.value)}
                        {...v.fieldProps("message", "feedback-message")}
                      />
                      <p className="text-right text-xs tabular-nums text-ink-500">
                        {values.message.length}/{MAX_FEEDBACK_MESSAGE}
                      </p>
                    </Field>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-ink-700">Screenshot (optional)</p>
                      <input
                        ref={fileInputRef}
                        id="feedback-screenshot"
                        type="file"
                        accept={ALLOWED_IMAGE_TYPES.join(",")}
                        onChange={handleFile}
                        className="sr-only"
                      />
                      {screenshot && previewUrl ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-ink-200/70 p-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewUrl}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-ink-900">
                              {screenshot.name}
                            </p>
                            <p className="text-xs text-ink-500">{formatFileSize(screenshot.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={clearScreenshot}
                            className="text-sm font-semibold text-danger hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="feedback-screenshot"
                          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink-200/70 px-4 py-2 text-sm font-semibold text-ink-700 transition-colors duration-(--duration-quick) hover:bg-ink-50"
                        >
                          <ImageUp className="h-4 w-4" aria-hidden="true" />
                          Choose image
                        </label>
                      )}
                      {fileError ? (
                        <p role="alert" className="text-sm font-medium text-danger">
                          {fileError}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-500">JPG, PNG or WebP, up to 2 MB.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p id="feedback-rating-label" className="text-sm font-medium text-ink-700">
                        Overall experience (optional)
                      </p>
                      <StarRating
                        value={values.rating}
                        onChange={(next) => set("rating", next)}
                        labelledBy="feedback-rating-label"
                      />
                    </div>

                    {error ? (
                      <p role="alert" className="text-sm font-medium text-danger">
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? (
                        "Sending…"
                      ) : (
                        <>
                          Send Feedback <Send className="h-4 w-4" aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </MotionConfig>
  );
}
```

Two notes for the implementer:

1. The `<img>` for the local preview is a real `<img>`, not `next/image` — the source is a blob URL with no known dimensions and nothing for the optimizer to do. The eslint disable comment above it is required and intentional.
2. `Button` accepts `variant="ghost"` — `inquiry-drawer.tsx` already uses it (verified). Do not add a new variant.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/feedback/components/feedback-panel.tsx
git commit -m "feat(feedback): add the feedback dialog and its form"
```

---

## Task 7: The launcher, the mount, and the public e2e test

This is the task that makes the feature visible. It ends with the widget working in a browser.

**Files:**
- Create: `src/features/feedback/components/feedback-launcher.tsx`
- Create: `src/features/feedback/index.ts`
- Modify: `src/components/layout/public-shell.tsx`
- Test: `tests/e2e/public/feedback.spec.ts`

**Interfaces:**
- Consumes: `FeedbackPanel` (Task 6).
- Produces: `<FeedbackLauncher />` (no props), exported from `@/features/feedback`.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/public/feedback.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * The floating feedback widget. No session required — feedback is anonymous.
 *
 * The submit test writes a real row to whatever database the dev server points
 * at. That is deliberate: the action is the only gate this endpoint has, and a
 * mock would not exercise it.
 */

test("the launcher opens the dialog and Escape closes it", async ({ page }) => {
  await page.goto("/");
  const launcher = page.getByRole("button", { name: /send feedback about this website/i });
  await expect(launcher).toBeVisible();

  await launcher.click();
  const dialog = page.getByRole("dialog", { name: "Send Feedback" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Anonymous");

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
});

test("a too-short subject is refused before the action runs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /send feedback about this website/i }).click();
  await page.getByLabel("Subject").fill("abc");
  await page.getByLabel("Message").fill("This message is easily long enough to pass.");
  await page.getByRole("button", { name: /^send feedback$/i }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Give this a short title." })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Send Feedback");
});

test("a complete report reaches the barangay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /send feedback about this website/i }).click();
  await page.getByRole("radio", { name: "Bug Report" }).click();
  await page.getByLabel("Subject").fill("E2E: dead download link");
  await page
    .getByLabel("Message")
    .fill("Filed by the Playwright suite. The transparency PDF returned a 404.");
  await page.getByRole("radio", { name: "4 stars" }).click();
  await page.getByRole("button", { name: /^send feedback$/i }).click();

  await expect(page.getByText(/this reached the barangay/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:e2e -- --project=public feedback`
Expected: FAIL — the launcher button does not exist.

If the dev server is not running, start it first (`npm run dev`) — check before starting another, one is often already up.

- [ ] **Step 3: Write the launcher**

Create `src/features/feedback/components/feedback-launcher.tsx`:

```tsx
"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeedbackPanel } from "./feedback-panel";

/**
 * The floating trigger, mounted once in PublicShell.
 *
 * `z-40` sits under the header's z-50 and well under the dialog layer (z-70), so
 * it never floats above the panel it opened. It is a sibling of the header
 * rather than a child, which matters: the chrome bars carry `backdrop-filter`,
 * and that establishes a containing block that would break `position: fixed`
 * for anything inside them.
 *
 * The collapse/expand is a CSS max-width transition at --duration-quick, not
 * Motion: it is a micro-interaction, and the three-pattern system keeps those in
 * CSS. It expands on focus-visible as well as hover so a keyboard user gets the
 * same disclosure. Below `sm` the label never expands — a phone has no hover and
 * the pill would cover content.
 */
export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Send feedback about this website"
        className={cn(
          "group fixed bottom-6 right-6 z-40 flex h-14 items-center gap-0 rounded-full bg-brand-500 pl-4 pr-4 text-ink-900 shadow-floating transition-all duration-(--duration-quick) ease-out-soft",
          "hover:bg-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 active:scale-[0.98]",
          open && "pointer-events-none opacity-0",
        )}
      >
        <MessageSquarePlus className="h-6 w-6 shrink-0" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-(--duration-quick) ease-out-soft sm:group-hover:ml-2 sm:group-hover:max-w-32 sm:group-focus-visible:ml-2 sm:group-focus-visible:max-w-32"
        >
          Feedback
        </span>
      </button>
      <FeedbackPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Write the barrel**

Create `src/features/feedback/index.ts`:

```ts
export { FeedbackLauncher } from "./components/feedback-launcher";
export { FeedbackPanel } from "./components/feedback-panel";
```

- [ ] **Step 5: Mount it**

Replace the whole of `src/components/layout/public-shell.tsx`:

```tsx
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FeedbackLauncher } from "@/features/feedback";

/**
 * Public-site chrome: floating header, content area, footer, and the feedback
 * launcher. Mounted here rather than per page so every public route carries it —
 * and so the admin portal, which has its own layout, carries none.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-grow">{children}</main>
      <SiteFooter />
      <FeedbackLauncher />
    </div>
  );
}
```

- [ ] **Step 6: Run the e2e suite**

Run: `npm run test:e2e -- --project=public feedback`
Expected: 3 passed.

If the third test fails with "We could not send your feedback", migration `0023` is not applied yet. **Say so in the report rather than working around it** — do not stub the action, and do not claim the task is verified.

- [ ] **Step 7: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all three exit 0. The build matters here: a client/server boundary mistake in the launcher chain shows up in the build and not in `tsc`.

- [ ] **Step 8: Commit**

```bash
git add src/features/feedback/components/feedback-launcher.tsx src/features/feedback/index.ts src/components/layout/public-shell.tsx tests/e2e/public/feedback.spec.ts
git commit -m "feat(feedback): mount the floating launcher on every public page"
```

- [ ] **Step 9: Show it working**

Take a screenshot of the collapsed launcher, the hover-expanded pill, and the open dialog on `/` at both a desktop and a 390px viewport, and attach them to the task report. This half of the feature is judged visually.

---

## Task 8: The shared tab-pill primitive

**Files:**
- Create: `src/components/ui/tab-pills.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`, `LucideIcon` type.
- Produces: `<TabPills tabs={…} value={…} onChange={…} label="…" />`, generic over the tab value union.

- [ ] **Step 1: Write the primitive**

Create `src/components/ui/tab-pills.tsx`:

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabPill<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface TabPillsProps<T extends string> {
  tabs: TabPill<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the strip for assistive tech, e.g. "Inbox queue". */
  label: string;
  className?: string;
}

/**
 * The rounded pill strip above a tabbed admin surface.
 *
 * Extracted from `transparency-manager.tsx`, where the same markup was written
 * out once per tab. The wrapper's `overflow-x-auto` is load-bearing: a strip
 * wider than a narrow phone has to scroll inside itself, or the whole document
 * pans sideways — the fix made across the admin portal in the mobile pass.
 *
 * A real `role="tablist"`, unlike ViewToggle's two `aria-pressed` buttons: these
 * do switch between distinct panels, so the tab semantics are honest here.
 */
export function TabPills<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: TabPillsProps<T>) {
  return (
    <div className={cn("max-w-full overflow-x-auto no-scrollbar", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex rounded-full border border-ink-200/70 bg-white p-1"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.value)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-(--duration-quick)",
                selected ? "bg-brand-500 text-ink-900" : "text-ink-600 hover:bg-ink-50",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

**Do not** migrate `transparency-manager.tsx` onto this in this task. That file has uncommitted edits in the working tree; adopting the primitive there is a separate follow-up.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. (Unused-export warnings are fine — Task 13 consumes it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tab-pills.tsx
git commit -m "refactor(ui): extract the admin tab-pill strip into a primitive"
```

---

## Task 9: The feedback query

**Files:**
- Create: `src/features/admin/queries/feedback.ts`

**Interfaces:**
- Consumes: `FeedbackRow` (Task 1), `feedbackCategoryLabel` (Task 2), `FEEDBACK_MEDIA_BUCKET` (Task 1), `createSupabaseAdminClient`, `toManilaDate` from `@/lib/format`.
- Produces: `listFeedback(): Promise<FeedbackRow[]>`.

- [ ] **Step 1: Write the query**

Create `src/features/admin/queries/feedback.ts`:

```ts
import type { FeedbackRow } from "@/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { toManilaDate } from "@/lib/format";
import { FEEDBACK_MEDIA_BUCKET } from "@/lib/storage";
import { feedbackCategoryLabel } from "@/features/feedback/data";

/** Ten minutes: long enough to open a thumbnail, short enough to be worthless if leaked. */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * The row shape as selected below.
 *
 * `handler` needs the cast for the same reason `listInquiries` does:
 * supabase-js types every embedded table as an array, but `handled_by` is a
 * many-to-one foreign key, so PostgREST returns one object — or null once the
 * account is gone.
 */
interface FeedbackQueryRow {
  id: string;
  category: FeedbackRow["category"];
  subject: string;
  message: string;
  rating: number | null;
  page_path: string;
  screenshot_path: string | null;
  status: FeedbackRow["status"];
  staff_note: string;
  handled_at: string | null;
  created_at: string;
  handler: { full_name: string } | null;
}

/**
 * The whole feedback queue, newest first. Uses the service-role client because
 * `feedback` has no RLS policies — callers MUST have checked
 * `requirePermission("handle-inquiries")` first (the page does).
 *
 * Screenshots live in a private bucket, so each one needs a signed URL. They are
 * signed in **one batch** for the page rather than per row: a queue of fifty
 * reports must not become fifty round trips.
 */
export async function listFeedback(): Promise<FeedbackRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select(
      "id, category, subject, message, rating, page_path, screenshot_path, status, staff_note, handled_at, created_at, handler:handled_by (full_name)",
    )
    .order("created_at", { ascending: false });
  if (error || !data) {
    if (error) console.error("listFeedback failed:", error.message);
    return [];
  }

  const rows = data as unknown as FeedbackQueryRow[];

  const paths = rows
    .map((row) => row.screenshot_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls, error: signError } = await admin.storage
      .from(FEEDBACK_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    // A signing failure must not empty the queue — the report still matters
    // without its thumbnail, so the row renders with screenshotUrl null.
    if (signError) console.error("listFeedback could not sign screenshots:", signError.message);
    for (const entry of urls ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    categoryLabel: feedbackCategoryLabel(row.category),
    subject: row.subject,
    message: row.message,
    rating: row.rating,
    pagePath: row.page_path,
    screenshotUrl: row.screenshot_path ? (signed.get(row.screenshot_path) ?? null) : null,
    status: row.status,
    staffNote: row.staff_note,
    handledByName: row.handler?.full_name ?? null,
    handledAt: row.handled_at ? toManilaDate(row.handled_at) : null,
    submittedAt: toManilaDate(row.created_at),
  }));
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/queries/feedback.ts
git commit -m "feat(feedback): add the admin queue query with batched signed URLs"
```

---

## Task 10: The admin actions

**Files:**
- Create: `src/features/admin/actions/feedback.ts`

**Interfaces:**
- Consumes: `FeedbackStatus`, `FeedbackUpdateValues` (Task 1), `discardFeedbackScreenshot` (Task 3), `checkPermission` / `checkSuperAdmin` / `NOT_FOUND` from `@/lib/auth`, `recordActivity` from `@/lib/audit`.
- Produces: `updateFeedback(id: string, values: FeedbackUpdateValues): Promise<ActionResult>`, `deleteFeedback(id: string): Promise<ActionResult>`, both with `ActionResult = { error: string | null }`.

- [ ] **Step 1: Write the actions**

Create `src/features/admin/actions/feedback.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { NOT_FOUND, checkPermission, checkSuperAdmin } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { discardFeedbackScreenshot } from "@/lib/media";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface ActionResult {
  error: string | null;
}

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "dismissed"]),
  staffNote: z.string().trim().max(2000, "Please keep the note short."),
});

/**
 * Audit class per outcome, following the inquiry inbox's convention so a
 * SuperAdmin filtering the log by outcome sees every queue's decisions together.
 */
const AUDIT: Record<FeedbackStatus, { type: "update" | "approve" | "reject"; action: string }> = {
  new: { type: "update", action: "reopened feedback" },
  in_progress: { type: "update", action: "took up feedback" },
  resolved: { type: "approve", action: "resolved feedback" },
  dismissed: { type: "reject", action: "dismissed feedback" },
};

/**
 * Move a feedback report through the queue and save the triage note.
 *
 * No transition guard, like the inquiry inbox: there is no resident-visible
 * state machine to protect and nothing irreversible at either end, so a report
 * dismissed by mistake is recovered by picking "New" again.
 */
export async function updateFeedback(
  id: string,
  values: FeedbackUpdateValues,
): Promise<ActionResult> {
  const actor = await checkPermission("handle-inquiries");
  if (!actor) return { error: NOT_FOUND };
  const parsed = updateSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid update." };
  }

  const admin = createSupabaseAdminClient();
  const settled = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
  const { data, error } = await admin
    .from("feedback")
    .update({
      status: parsed.data.status,
      staff_note: parsed.data.staffNote,
      handled_by: actor.id,
      // Stamped only once the report is off the queue — "handled at" is when it
      // stopped needing someone, not when it was last looked at.
      handled_at: settled ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("subject")
    .maybeSingle();
  if (error) return { error: "Could not save the feedback." };
  if (!data) return { error: "That feedback no longer exists." };

  const entry = AUDIT[parsed.data.status];
  await recordActivity(actor, {
    type: entry.type,
    action: entry.action,
    entityType: "feedback",
    entityId: id,
    entityLabel: data.subject,
    detail: parsed.data.staffNote || undefined,
  });
  revalidatePath("/admin/inquiries");
  return { error: null };
}

/**
 * Permanently delete one dismissed report and its screenshot.
 *
 * Two conditions, both enforced here and neither taken on the UI's word:
 * **SuperAdmin**, and the row must already be `dismissed`. That is
 * `guardDelete()`'s shape, deliberately reimplemented rather than reused —
 * `guardDelete` keys on `archived`, and feedback has no archive lifecycle, so
 * `dismissed` plays that part.
 *
 * Feedback has a delete where inquiries do not, and the difference is the point:
 * this endpoint is anonymous and accepts image uploads, so spam needs a janitor.
 * A named resident's message must never be erasable.
 */
export async function deleteFeedback(id: string): Promise<ActionResult> {
  const actor = await checkSuperAdmin();
  if (!actor) return { error: NOT_FOUND };

  const admin = createSupabaseAdminClient();
  const { data: existing, error: readError } = await admin
    .from("feedback")
    .select("status, subject, screenshot_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: "Could not load that feedback." };
  if (!existing) return { error: "That feedback no longer exists." };
  if (existing.status !== "dismissed") {
    return { error: "Dismiss the feedback first — only dismissed reports can be deleted." };
  }

  const { error } = await admin.from("feedback").delete().eq("id", id);
  if (error) return { error: "Could not delete the feedback." };

  // After the row, never before: an orphaned object is a logged nuisance, a
  // deleted file with a surviving row is a broken record.
  await discardFeedbackScreenshot(existing.screenshot_path, `deleteFeedback ${id}`);

  await recordActivity(actor, {
    type: "delete",
    action: "deleted feedback",
    entityType: "feedback",
    entityId: id,
    entityLabel: existing.subject,
  });
  revalidatePath("/admin/inquiries");
  return { error: null };
}
```

`"delete"` is a member of `AUDIT_ACTIONS` in `src/types/index.ts` (verified) — do not widen that union.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/actions/feedback.ts
git commit -m "feat(feedback): add triage and SuperAdmin-only delete actions"
```

---

## Task 11: The feedback drawer

**Files:**
- Create: `src/features/admin/components/feedback-drawer.tsx`

**Interfaces:**
- Consumes: `FeedbackRow`, `FeedbackStatus`, `FeedbackUpdateValues` (Task 1); `Button`, `Field`, `Select`, `Textarea`; `formatDate` from `@/lib/format`; `StatusChip` from `./status-chip`.
- Produces: `<FeedbackDrawer record onSave onCancel saving error />` with `onSave: (id: string, values: FeedbackUpdateValues) => void`, and the exported constant `FEEDBACK_STATUS_OPTIONS: { value: FeedbackStatus; label: string }[]`.

- [ ] **Step 1: Write the drawer**

Create `src/features/admin/components/feedback-drawer.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { FeedbackRow, FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/format";
import { StatusChip } from "./status-chip";

interface FeedbackDrawerProps {
  record: FeedbackRow;
  onSave: (id: string, values: FeedbackUpdateValues) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

export const FEEDBACK_STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed (spam or duplicate)" },
];

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-ink-900">{value}</dd>
    </div>
  );
}

/**
 * One report, read-only, plus the two fields staff can change.
 *
 * There is no reply affordance here — unlike InquiryDrawer, which puts the
 * resident's email and phone one click away. Feedback is anonymous; the only
 * outward action is fixing the thing it describes.
 *
 * No autosave: two fields with no draft model, the same reason
 * AchievementsEditor is out of `useFormDraft`'s scope.
 */
export function FeedbackDrawer({ record, onSave, onCancel, saving, error }: FeedbackDrawerProps) {
  const [status, setStatus] = useState<FeedbackStatus>(record.status);
  const [staffNote, setStaffNote] = useState(record.staffNote);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-lg font-bold text-ink-900">{record.subject}</p>
          <StatusChip status={record.status} />
        </div>
        <dl className="space-y-4">
          <DetailRow label="Category" value={record.categoryLabel} />
          <DetailRow
            label="Rating"
            value={record.rating ? `${record.rating} of 5` : "Not rated"}
          />
          <DetailRow
            label="Sent from"
            value={
              record.pagePath ? (
                <a
                  href={record.pagePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                >
                  {record.pagePath}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                "Not recorded"
              )
            }
          />
          <DetailRow label="Received" value={formatDate(record.submittedAt)} />
        </dl>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{record.message}</p>
        </div>
        {record.screenshotUrl ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Screenshot
            </p>
            <a
              href={record.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit overflow-hidden rounded-2xl border border-ink-200/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={record.screenshotUrl}
                alt={`Screenshot attached to "${record.subject}"`}
                className="max-h-64 w-auto object-contain"
              />
            </a>
            <p className="mt-2 text-xs text-ink-500">
              This link is signed and expires after ten minutes. Reload the page for a fresh one.
            </p>
          </div>
        ) : null}
        <Field label="Status" htmlFor="feedback-status">
          <Select
            id="feedback-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
          >
            {FEEDBACK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Staff note"
          htmlFor="feedback-note"
          hint="What was done about it. Internal only — nobody can be written back to."
        >
          <Textarea
            id="feedback-note"
            rows={4}
            value={staffNote}
            onChange={(event) => setStaffNote(event.target.value)}
            placeholder="e.g. Re-uploaded the 2025 budget PDF, 23 July."
          />
        </Field>
        {record.handledByName && record.handledAt ? (
          <p className="text-sm text-ink-600">
            Last handled by {record.handledByName} on {formatDate(record.handledAt)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(record.id, { status, staffNote: staffNote.trim() })}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
```

The signed URL is rendered with a plain `<img>`: `next/image` would need the Supabase host allow-listed in `next.config.ts` and would try to cache a URL that expires in ten minutes. The disable comment is intentional.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/components/feedback-drawer.tsx
git commit -m "feat(feedback): add the admin triage drawer"
```

---

## Task 12: The feedback queue panel

**Files:**
- Create: `src/features/admin/components/feedback-panel.tsx`

**Interfaces:**
- Consumes: `FeedbackRow`, `FeedbackStatus`, `FeedbackUpdateValues` (Task 1); `averageRating`, `FEEDBACK_CATEGORIES` (Task 2); `updateFeedback`, `deleteFeedback` (Task 10); `FeedbackDrawer`, `FEEDBACK_STATUS_OPTIONS` (Task 11); the admin primitives `AdminEmptyState`, `AdminFilterBar`, `AdminPagination`, `AdminStatCard`, `StatusChip`; `Card`/`CardHeader`, `ConfirmDialog`, `Drawer`, `RowActions`, `SortableTh`, `Toast`, `useTableSort`, `useEditDeepLink`, `useToast`, `formatDate`, `fuzzyFilter`, `haystack`.
- Produces: `<FeedbackPanel records={FeedbackRow[]} isSuperAdmin={boolean} active={boolean} />`. `active` gates the deep-link consumption.

**Name collision warning:** there is already a `FeedbackPanel` in `src/features/feedback/components/`. They live in different modules and are never imported into the same file, but when importing, always take the admin one from `./feedback-panel` inside `features/admin/components/` — never re-export it from `@/features/feedback`.

- [ ] **Step 1: Write the panel**

Create `src/features/admin/components/feedback-panel.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Inbox, MailOpen, MessagesSquare, Star, Trash2, XCircle } from "lucide-react";
import type { FeedbackRow, FeedbackStatus, FeedbackUpdateValues } from "@/types";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { useEditDeepLink } from "@/hooks/use-edit-deep-link";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import { deleteFeedback, updateFeedback } from "@/features/admin/actions/feedback";
import { FEEDBACK_CATEGORIES, averageRating } from "@/features/feedback/data";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPagination } from "./admin-pagination";
import { AdminStatCard } from "./admin-stat-card";
import { FeedbackDrawer, FEEDBACK_STATUS_OPTIONS } from "./feedback-drawer";
import { StatusChip } from "./status-chip";

const PAGE_SIZE = 8;

interface FeedbackPanelProps {
  records: FeedbackRow[];
  /** Decides whether Delete is offered. Presentation only — the action re-checks. */
  isSuperAdmin: boolean;
  /** False while the other tab is showing: only the visible panel consumes ?review=. */
  active: boolean;
}

/**
 * The site-feedback queue.
 *
 * Not a ticket queue and not an inbox: nobody can be written back to, so the
 * only forward actions are "someone is looking at this", "the thing is fixed",
 * and "this is spam". There is no New button — every row arrived from the
 * floating widget on the public site.
 */
export function FeedbackPanel({ records, isSuperAdmin, active }: FeedbackPanelProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; subject: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const newCount = records.filter((record) => record.status === "new").length;
  const average = averageRating(records);

  const filtered = useMemo(() => {
    const narrowed = records.filter(
      (record) =>
        (category === "all" || record.category === category) &&
        (status === "all" || record.status === status),
    );
    return fuzzyFilter(narrowed, search, (record) =>
      haystack(record.subject, record.message, record.categoryLabel, record.pagePath),
    );
  }, [records, search, category, status]);

  // Newest first: the queue is worked from the top.
  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "received", dir: "desc" },
    {
      category: (r) => r.categoryLabel,
      subject: (r) => r.subject,
      // Unrated sorts as -1 so it lands at one end rather than mixing with 1s.
      rating: (r) => r.rating ?? -1,
      received: (r) => r.submittedAt,
      status: (r) => r.status,
    },
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = openId ? (records.find((record) => record.id === openId) ?? null) : null;

  // Global-search results arrive as ?tab=feedback&review=<id>.
  useEditDeepLink(
    "review",
    (id) => {
      if (records.some((record) => record.id === id)) {
        setFormError(null);
        setOpenId(id);
      } else {
        showError("That feedback no longer exists.");
      }
    },
    active,
  );

  const closeDrawer = () => {
    setOpenId(null);
    setFormError(null);
  };

  const handleSave = (id: string, values: FeedbackUpdateValues) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateFeedback(id, values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      closeDrawer();
      showToast("Feedback updated.");
      router.refresh();
    });
  };

  /** The kebab's one-click moves. They keep whatever note is already saved. */
  const setStatusFor = (record: FeedbackRow, next: FeedbackStatus, message: string) => {
    startTransition(async () => {
      const result = await updateFeedback(record.id, { status: next, staffNote: record.staffNote });
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(message);
      router.refresh();
    });
  };

  const runDelete = () => {
    if (!confirmingDelete) return;
    const { id, subject } = confirmingDelete;
    setActionPending(true);
    startTransition(async () => {
      const result = await deleteFeedback(id);
      setActionPending(false);
      setConfirmingDelete(null);
      if (result.error) {
        showError(result.error);
        return;
      }
      showToast(`Deleted "${subject}".`);
      router.refresh();
    });
  };

  const rowActions = (record: FeedbackRow): RowAction[] => {
    const actions: RowAction[] = [
      {
        label: "Mark in progress",
        icon: MailOpen,
        disabled: record.status === "in_progress",
        onSelect: () => setStatusFor(record, "in_progress", "Took up the feedback."),
      },
      {
        label: "Mark resolved",
        icon: CheckCircle2,
        disabled: record.status === "resolved",
        onSelect: () => setStatusFor(record, "resolved", "Marked the feedback resolved."),
      },
      {
        // Not destructive: the row stays and can be reopened, so no confirm.
        label: "Dismiss",
        icon: XCircle,
        tone: "danger",
        disabled: record.status === "dismissed",
        onSelect: () => setStatusFor(record, "dismissed", "Feedback dismissed."),
      },
    ];
    // Two conditions, matching the umbrella rule: SuperAdmin, and only from a
    // record already dismissed. The action re-checks both server-side.
    if (isSuperAdmin && record.status === "dismissed") {
      actions.push({
        label: "Delete",
        icon: Trash2,
        tone: "danger",
        onSelect: () => setConfirmingDelete({ id: record.id, subject: record.subject }),
      });
    }
    return actions;
  };

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setStatus("all");
    setPage(1);
  };

  return (
    <>
      <div className="mb-6 grid gap-6 sm:grid-cols-3">
        <AdminStatCard icon={MessagesSquare} label="Total Feedback" value={records.length} />
        <AdminStatCard
          icon={Inbox}
          label="Unreviewed"
          value={newCount}
          tone={newCount > 0 ? "danger" : "secondary"}
        />
        <AdminStatCard
          icon={Star}
          label="Average Rating"
          value={average === null ? "—" : average.toFixed(1)}
          tone="secondary"
        />
      </div>
      <Card>
        <CardHeader
          title="Website Feedback"
          className="mb-0 flex-wrap gap-3 px-6 pt-6"
          action={
            <AdminFilterBar
              search={{
                id: "feedback-search",
                value: search,
                placeholder: "Search subject, message or page…",
                onChange: (value) => {
                  setSearch(value);
                  setPage(1);
                },
              }}
              selects={[
                {
                  id: "feedback-category-filter",
                  label: "Category",
                  value: category,
                  options: [
                    { value: "all", label: "All Categories" },
                    ...FEEDBACK_CATEGORIES.map((entry) => ({
                      value: entry.value,
                      label: entry.label,
                    })),
                  ],
                  onChange: (value) => {
                    setCategory(value);
                    setPage(1);
                  },
                },
                {
                  id: "feedback-status-filter",
                  label: "Status",
                  value: status,
                  options: [{ value: "all", label: "All Statuses" }, ...FEEDBACK_STATUS_OPTIONS],
                  onChange: (value) => {
                    setStatus(value);
                    setPage(1);
                  },
                },
              ]}
            />
          }
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            message={
              records.length === 0
                ? "No feedback yet. Notes sent from the button on the public site land here."
                : "No feedback matches your filters."
            }
            onClear={records.length === 0 ? undefined : clearFilters}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-180 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Category" sortKey="category" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Subject" sortKey="subject" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Rating" sortKey="rating" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4">Page</th>
                    <SortableTh label="Received" sortKey="received" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((record) => (
                    <tr key={record.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 text-ink-600">{record.categoryLabel}</td>
                      <td className="max-w-80 px-6 py-4">
                        <p className="font-semibold text-ink-900">{record.subject}</p>
                        <p className="line-clamp-1 text-xs text-ink-500">{record.message}</p>
                      </td>
                      <td className="px-6 py-4 text-ink-600 tabular-nums">
                        {record.rating ? `★ ${record.rating}` : "—"}
                      </td>
                      <td className="max-w-40 truncate px-6 py-4 font-mono text-xs text-ink-500">
                        {record.pagePath || "—"}
                      </td>
                      <td className="px-6 py-4 text-ink-600">{formatDate(record.submittedAt)}</td>
                      <td className="px-6 py-4">
                        <StatusChip status={record.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setFormError(null);
                              setOpenId(record.id);
                            }}
                            aria-label={`Open the feedback "${record.subject}"`}
                            className="text-sm font-semibold text-brand-700 hover:underline"
                          >
                            Open
                          </button>
                          <RowActions label={record.subject} actions={rowActions(record)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>
      <Drawer open={open !== null} onClose={closeDrawer} title="Feedback">
        {open ? (
          <FeedbackDrawer
            key={open.id}
            record={open}
            onSave={handleSave}
            onCancel={closeDrawer}
            saving={isPending}
            error={formError}
          />
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={confirmingDelete !== null}
        title="Delete this feedback?"
        body={
          <>
            <strong className="font-semibold text-ink-900">{confirmingDelete?.subject}</strong> and
            any screenshot attached to it will be removed permanently. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        pending={actionPending}
        onConfirm={runDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. If `min-w-180` is not a valid Tailwind class in this setup, use the value the other admin tables use (`min-w-160`) — invalid utilities fail silently, which typecheck cannot catch.

- [ ] **Step 3: Commit**

```bash
git add src/features/admin/components/feedback-panel.tsx
git commit -m "feat(feedback): add the admin feedback queue panel"
```

---

## Task 13: The tabbed inbox — split, rename, wire, verify

The task that turns two half-features into the page. It ends with the admin surface working in a browser.

**Files:**
- Create: `src/features/admin/components/inquiries-panel.tsx`
- Create: `src/features/admin/components/inbox-manager.tsx`
- Delete: `src/features/admin/components/inquiries-manager.tsx`
- Modify: `src/features/admin/index.ts`
- Modify: `src/features/admin/data.ts`
- Modify: `src/constants/permissions.ts`
- Modify: `src/app/admin/(portal)/inquiries/page.tsx`
- Modify: `src/app/admin/(portal)/inquiries/loading.tsx`
- Test: `tests/e2e/admin/inbox-tabs.spec.ts`

**Interfaces:**
- Consumes: `TabPills` (Task 8), `listFeedback` (Task 9), the admin `FeedbackPanel` (Task 12), everything today's `InquiriesManager` already imports.
- Produces: `<InboxManager inquiries={InquiryRow[]} feedback={FeedbackRow[]} isSuperAdmin={boolean} />`, exported from `@/features/admin`.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/admin/inbox-tabs.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * The Inquiries & Feedback page. Uses the stored admin session; the whole file
 * skips when E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD are unset.
 */

test("the inbox page offers both queues as tabs", async ({ page }) => {
  await page.goto("/admin/inquiries");
  await expect(page.getByRole("heading", { name: "Inquiries & Feedback" })).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Inbox queue" });
  await expect(tabs.getByRole("tab", { name: "Inquiries" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await tabs.getByRole("tab", { name: "Feedback" }).click();
  await expect(page.getByText("Website Feedback")).toBeVisible();
  await expect(page.getByText("Average Rating")).toBeVisible();
});

test("?tab=feedback lands on the feedback queue directly", async ({ page }) => {
  await page.goto("/admin/inquiries?tab=feedback");
  await expect(page.getByText("Website Feedback")).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "Inbox queue" }).getByRole("tab", { name: "Feedback" }),
  ).toHaveAttribute("aria-selected", "true");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run test:e2e -- --project=admin inbox-tabs`
Expected: FAIL (heading is still "Inquiries"), or SKIPPED if the admin credentials are not in `.env.local` — in which case say so in the report and rely on the browser check in Step 10.

- [ ] **Step 3: Create `inquiries-panel.tsx` from the existing manager**

```bash
git mv src/features/admin/components/inquiries-manager.tsx src/features/admin/components/inquiries-panel.tsx
```

Then make exactly four edits to the moved file, changing nothing else:

1. Rename the component and its props interface:

```tsx
interface InquiriesPanelProps {
  inquiries: InquiryRow[];
  /** False while the other tab is showing: only the visible panel consumes ?review=. */
  active: boolean;
}

export function InquiriesPanel({ inquiries, active }: InquiriesPanelProps) {
```

2. Update the doc comment's first line to read `/** The contact-form inbox, as one tab of the Inquiries & Feedback page.` and keep the rest of it.

3. Remove the `<AdminPageHeader … />` element from the returned JSX (the parent renders one header for both tabs) and drop the now-unused `import { AdminPageHeader } from "./admin-page-header";`.

4. Pass the gate to the deep-link hook:

```tsx
  useEditDeepLink(
    "review",
    (id) => {
      if (inquiries.some((record) => record.id === id)) {
        setFormError(null);
        setOpenId(id);
      } else {
        showError("That inquiry no longer exists.");
      }
    },
    active,
  );
```

- [ ] **Step 4: Write `inbox-manager.tsx`**

Create `src/features/admin/components/inbox-manager.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import type { FeedbackRow, InquiryRow } from "@/types";
import { TabPills, type TabPill } from "@/components/ui/tab-pills";
import { AdminPageHeader } from "./admin-page-header";
import { FeedbackPanel } from "./feedback-panel";
import { InquiriesPanel } from "./inquiries-panel";

type Tab = "inquiries" | "feedback";

const TABS: TabPill<Tab>[] = [
  { value: "inquiries", label: "Inquiries", icon: MessagesSquare },
  { value: "feedback", label: "Feedback", icon: MessageSquarePlus },
];

interface InboxManagerProps {
  inquiries: InquiryRow[];
  feedback: FeedbackRow[];
  /**
   * Decides whether Delete is offered on a dismissed report. Presentation only —
   * `deleteFeedback` re-checks with `checkSuperAdmin()`.
   */
  isSuperAdmin: boolean;
}

/**
 * The two inbound queues on one page: messages residents sent through the
 * contact form, and anonymous feedback about the website.
 *
 * One page and one permission rather than two nav entries, because the same
 * people work both and a second permission would let an account see the page
 * but only half of it.
 *
 * The tab is read in the useState initialiser, not an effect: a search hit
 * arrives as ?tab=feedback&review=<id>, and the panel that owns the record has
 * to be the one that mounts, so that it — and only it — consumes `review`.
 * Both panels are also handed an `active` flag for the same reason.
 */
export function InboxManager({ inquiries, feedback, isSuperAdmin }: InboxManagerProps) {
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(initialTab === "feedback" ? "feedback" : "inquiries");

  return (
    <>
      <AdminPageHeader
        title="Inquiries & Feedback"
        description="Messages from the contact form, and feedback about this website."
      />
      <TabPills tabs={TABS} value={tab} onChange={setTab} label="Inbox queue" className="mb-6" />
      {tab === "inquiries" ? (
        <InquiriesPanel inquiries={inquiries} active />
      ) : (
        <FeedbackPanel records={feedback} isSuperAdmin={isSuperAdmin} active />
      )}
    </>
  );
}
```

The unmounted panel receives no props at all, so `active` is simply `true` on whichever is rendered — the flag exists so neither panel strips a query parameter meant for the other, and unmounting achieves that. Keep the prop: it documents the contract and survives a future change to keeping both mounted.

- [ ] **Step 5: Update the barrel**

In `src/features/admin/index.ts`, replace the `InquiriesManager` line with:

```ts
export { InboxManager } from "./components/inbox-manager";
```

- [ ] **Step 6: Rename the nav entry**

In `src/features/admin/data.ts`, that one line becomes:

```ts
  { label: "Inquiries & Feedback", href: "/admin/inquiries", icon: MessagesSquare, permission: "handle-inquiries", group: "requests" },
```

Nothing else changes: the sidebar, the mobile drawer, the `/admin` redirect and `adminPageTitle` all read this table.

- [ ] **Step 7: Rename the permission label**

In `src/constants/permissions.ts`:

```ts
  "handle-inquiries": "Answer inquiries & site feedback",
```

Leave `PERMISSION_GROUPS` and `STATUS_PRESETS` alone — the `staff` preset already grants `handle-inquiries`, which now also means feedback, and that is intended.

- [ ] **Step 8: Rewrite the page**

Replace the whole of `src/app/admin/(portal)/inquiries/page.tsx`:

```tsx
import { checkSuperAdmin, gatedMetadata, requirePermission } from "@/lib/auth";
import { InboxManager } from "@/features/admin";
import { listFeedback } from "@/features/admin/queries/feedback";
import { listInquiries } from "@/features/admin/queries/inquiries";

export const generateMetadata = gatedMetadata("handle-inquiries", "Inquiries & Feedback");

export default async function AdminInquiriesPage() {
  await requirePermission("handle-inquiries");
  const [inquiries, feedback, actor] = await Promise.all([
    listInquiries(),
    listFeedback(),
    checkSuperAdmin(),
  ]);
  return (
    <InboxManager inquiries={inquiries} feedback={feedback} isSuperAdmin={actor !== null} />
  );
}
```

The route stays `/admin/inquiries`: renaming it would break every existing bookmark and every `revalidatePath` call for no gain.

- [ ] **Step 9: Update the loading skeleton**

Replace `src/app/admin/(portal)/inquiries/loading.tsx`:

```tsx
import {
  FilterBarSkeleton,
  PageHeaderSkeleton,
  PageSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton what="the inbox">
      <PageHeaderSkeleton />
      {/* Stands in for the tab strip, so the header does not jump when it arrives. */}
      <div className="mb-6 h-11 w-64 rounded-full bg-ink-100" />
      <StatCardsSkeleton />
      <FilterBarSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
```

`PageSkeleton` renders `Loading {what}…`, so `what="the inbox"` reads "Loading the inbox…" (verified in `src/components/ui/skeleton.tsx`).

- [ ] **Step 10: Run everything**

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run build
npm run test:e2e -- --project=public
npm run test:e2e -- --project=admin
```

Expected: typecheck/lint/build exit 0, unit tests pass, both e2e projects pass (the admin project skips without credentials — report that rather than glossing it).

Then drive it in a browser: sign in, open `/admin/inquiries`, confirm the sidebar reads **Inquiries & Feedback**, both tabs render, the Feedback tab shows stat cards and the queue, a row's kebab moves status, the drawer opens with the screenshot thumbnail, and Delete appears **only** on a dismissed row for a SuperAdmin. Screenshot the two tabs and attach them.

- [ ] **Step 11: Commit**

```bash
git add -A src/features/admin src/constants/permissions.ts "src/app/admin/(portal)/inquiries" tests/e2e/admin/inbox-tabs.spec.ts
git commit -m "feat(feedback): fold the feedback queue into Inquiries & Feedback tabs"
```

Note: `git add -A` on a narrowed path is used here because this task **deletes** a file; a bare `git add` of the new paths would leave the removal unstaged. Do not run `git add -A` from the repo root — there are unrelated uncommitted changes in the working tree.

---

## Task 14: Register feedback in the global search

Last, because it is the only task that depends on both halves being real.

**Files:**
- Modify: `src/features/admin/search-modules.ts`

**Interfaces:**
- Consumes: the `feedback` branch of `search_admin_global` (shipped in Task 1's migration).
- Produces: nothing new — `hrefForHit("feedback", id)` now returns `/admin/inquiries?tab=feedback&review=<id>`.

- [ ] **Step 1: Add the module in four places**

In `src/features/admin/search-modules.ts`:

```ts
export const SEARCH_MODULES = [
  "news",
  "announcements",
  "events",
  "officials",
  "services",
  "legislative",
  "documents",
  "projects",
  "applications",
  "appointments",
  "complaints",
  "assistance",
  "feedback",
] as const;
```

```ts
export const MODULE_PERMISSION: Record<SearchModule, Permission | null> = {
  // …existing entries unchanged…
  assistance: "handle-assistance",
  feedback: "handle-inquiries",
};
```

```ts
export const MODULE_META: Record<SearchModule, { label: string; href: string }> = {
  // …existing entries unchanged…
  assistance: { label: "Assistance Requests", href: "/admin/assistance" },
  feedback: { label: "Feedback", href: "/admin/inquiries" },
};
```

```ts
const MODULE_TAB: Partial<Record<SearchModule, string>> = {
  news: "news",
  announcements: "announcements",
  legislative: "legislative",
  documents: "documents",
  projects: "projects",
  feedback: "feedback",
};
```

```ts
/**
 * Modules whose hit opens a review drawer rather than an editor. Feedback is
 * here for the same reason the ticket flows are: there is nothing to edit, only
 * a report to read and triage.
 */
const TICKET_MODULES: SearchModule[] = [
  "applications",
  "appointments",
  "complaints",
  "assistance",
  "feedback",
];
```

`MODULE_PERMISSION` and `MODULE_META` are `Record`s over `SearchModule`, so TypeScript will refuse to build until all four are updated — that is the guard, not a checklist.

- [ ] **Step 2: Verify**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0.

- [ ] **Step 3: Check it in the browser**

Sign in, submit a feedback report through the public widget with a distinctive subject, then type part of that subject into the admin top-bar search. Expected: a hit grouped under **Feedback** that lands on `/admin/inquiries?tab=feedback` with the drawer open on that report.

This step needs migration `0023` applied — the RPC replacement ships in it. If the search returns nothing for feedback while other modules still work, that is the missing migration, not a bug. Report it as such.

- [ ] **Step 4: Commit**

```bash
git add src/features/admin/search-modules.ts
git commit -m "feat(feedback): surface feedback in the global admin search"
```

---

## Task 15: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKEND_HANDOFF.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Three edits, each a sentence or two — this file is guidance, not a changelog:

1. In the **Project** paragraph, add site feedback to the list of live, DB-backed features and update the migration range to `0001`–`0023`.
2. In **Architecture**, add a bullet after the archive-vs-delete one:

> - **Feedback is anonymous, and that shapes everything about it** (sub-project 10, migration `0023`). The public widget stores no name, email or IP, so there is no consent field, no reply path, and no `/track` entry — `/contact` remains the channel for anything needing an answer. Screenshots live in the **private** `feedback-media` bucket and are read through ten-minute signed URLs minted in the query layer, because a screenshot can contain the sender's own account page. `feedback` is the one table with a delete that is not gated on `archived`: SuperAdmin, from a `dismissed` row only, because an anonymous endpoint that accepts images needs a janitor. Inquiries still have no delete at all.
3. In **Conventions and gotchas**, note that the admin nav entry is `Inquiries & Feedback` at the unchanged `/admin/inquiries` route, and that `src/components/ui/tab-pills.tsx` is the shared tab strip — `transparency-manager.tsx` still has its own copy and is a pending follow-up.

- [ ] **Step 2: Update `docs/BACKEND_HANDOFF.md`**

Add a short section for the `feedback` table matching the file's existing per-table format, and record the two open items: **no staff email on arrival** (waits on 2D/Resend) and **screenshots accumulate until someone dismisses and deletes** the spam.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/BACKEND_HANDOFF.md
git commit -m "docs: record the feedback widget and its anonymity constraints"
```

---

## Self-review

**Spec coverage.** Every section maps to a task: data model → 1; types → 1; storage/private bucket → 1, 3; categories/schema → 2; trigger → 7; panel → 6; stars → 5; picker → 6; action → 4; nav + permission naming → 13; tab primitive → 8; page/component split → 13; queue panel → 12; drawer → 11; admin actions incl. two-condition delete → 10; query + signed URLs → 9; global search → 1 (SQL) + 14 (TS); testing → 2, 7, 13; migration notes → 1; out-of-scope → untouched by construction.

**Two spec statements corrected here.** The spec hedged that `tests/unit/admin-nav.test.ts` might assert the old label; it does not — its `ITEMS` are a local fixture, so no change is needed, and this plan says so. The spec also implied `averageRating` might live in the admin feature; it lives in `src/features/feedback/data.ts`, since it is pure and feedback-specific, and the admin panel imports it.

**Known naming collision, resolved deliberately:** `FeedbackPanel` exists twice — the public dialog (`src/features/feedback/components/`) and the admin queue (`src/features/admin/components/`). They are never imported into one file, and Task 12 states the rule.
