# Resend Email — Plan 2: Remaining Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the second of three staged Resend email plans — feedback's staff alert, all
four ticketing flows' submission receipts (public + walk-in), and all 8 "final outcome"
status-change notices — closing every trigger in
`docs/superpowers/specs/2026-07-30-resend-email-integration-design.md` except delivery
monitoring (Plan 3, separate).

**Architecture:** Reuses everything Plan 1 already built and shipped —
`sendEmail()` (`src/lib/email.ts`), `<EmailLayout>`, and `staffEmailsFor()`
(`src/lib/notifications.ts`, already unit-tested in `tests/unit/notifications.test.ts`).
This plan adds one new shared resident-facing template component,
`<TicketNotice>` (`src/emails/shared/TicketNotice.tsx`), because the 12 receipt/status
templates this plan adds are otherwise near-identical hand-rolled JSX — the same reasoning
the design doc used to reject plain HTML strings (Approach B) applies one level down. 13
new template files total (1 staff alert + 12 resident notices), wired into 4 public Server
Actions, 4 walk-in Server Actions, and 6 status-change Server Actions (8 transitions across
6 functions — `closeComplaint` and `decideAssistance` each cover two outcomes).

**Tech Stack:** Same as Plan 1 — `resend`, `react-email`, `@react-email/render` (all
already installed, no new dependency). Next.js 16 Server Actions, Zod v4, Vitest for
template render tests.

## Global Constraints

- Every email send uses `sendEmail()` from `src/lib/email.ts` — always `await`ed, never
  fire-and-forget (`void sendEmail(...)`), and its return value is never checked by the
  caller (fail-open by construction; see `src/lib/email.ts`'s own doc comment).
- Templates are pure, typed-prop components under `src/emails/` — no DB or Supabase client
  access inside a template. Every resident-facing template composes the new
  `<TicketNotice>` (itself wrapped in `<EmailLayout>`); the one staff-facing template in
  this plan (`FeedbackStaffNotifyEmail`) wraps `<EmailLayout>` directly, mirroring
  `InquiryStaffNotifyEmail.tsx`.
- A resident-facing email is skipped silently (not an error, no `{ error }` returned) when
  the resident's `email` is null/`""` — the exact nullable handling every ticket action
  already applies to the column itself (`email: parsed.data.email || null`).
- Staff-facing emails resolve recipients via the already-built, already-tested
  `staffEmailsFor(permission)` — skip silently when it resolves to `[]`. Nothing new to
  build in `src/lib/notifications.ts`.
- Status-change emails fire only on the "final outcome" transitions in the design's table
  (§"Trigger points — ticketing status-change"): `approved`/`rejected` (not `released`),
  `confirmed`/`declined` (not `completed`), `resolved`/`dismissed` (not `under-review`),
  `granted`/`declined` (not `under-review`). Every reviewing action already computes a
  boolean for its terminal branches (`approved`, `confirmed`, `dismissed`, `resolved`,
  `declined`, `granted`) — reuse that existing `const`, don't add a second one.
  `releaseApplication` and `completeAppointment` get no email at all.
- Every email send happens **after** its triggering DB write has already committed — never
  gates or blocks the write, matching every existing action in this codebase.
  `submitFeedback`'s compensating-delete-on-insert-failure path is unaffected by this plan.
- Ticket-tracking links are `/track?ticket=${encodeURIComponent(ticketNo)}`, matching
  `complaint-form.tsx`'s own on-screen receipt link — don't invent a second URL shape.
- Reuse the exact appointment-period copy already established in
  `src/features/track/actions.ts:131` (`"Morning (8:00 AM – 12:00 NN)"` /
  `"Afternoon (1:00 PM – 5:00 PM)"`) via the new `periodLabel()` helper — don't write a
  second wording of the same fact.
- No new npm dependency. No new migration, no new env var.
- Vitest render tests follow the exact pattern already established in
  `tests/unit/inquiry-emails.test.ts` and `tests/unit/email-layout.test.ts`: import
  `render` from `@react-email/render`, `createElement` from `react`, assert on substrings
  of the rendered HTML. Server Action wiring itself has no dedicated unit test in this
  plan — Plan 1's `submitInquiry` wiring set that precedent (only its templates got
  render tests); verify wiring via `npm run typecheck` plus the manual pass in Task 7.
- CLAUDE.md and `docs/BACKEND_HANDOFF.md` are updated in the same session this plan ships
  in, per the project's standing documentation rule — Task 7, not deferred.

---

## File structure

**New:**
- `src/emails/shared/text.ts` — `periodLabel()`, `excerpt()` pure helpers.
- `src/emails/shared/TicketNotice.tsx` — shared resident-facing ticket email body.
- `src/emails/FeedbackStaffNotifyEmail.tsx`
- `src/emails/ApplicationSubmittedEmail.tsx`, `ApplicationApprovedEmail.tsx`,
  `ApplicationRejectedEmail.tsx`
- `src/emails/AppointmentSubmittedEmail.tsx`, `AppointmentConfirmedEmail.tsx`,
  `AppointmentDeclinedEmail.tsx`
- `src/emails/ComplaintSubmittedEmail.tsx`, `ComplaintResolvedEmail.tsx`,
  `ComplaintDismissedEmail.tsx`
- `src/emails/AssistanceSubmittedEmail.tsx`, `AssistanceGrantedEmail.tsx`,
  `AssistanceDeclinedEmail.tsx`
- `tests/unit/email-shared-text.test.ts`
- `tests/unit/ticket-notice.test.ts`
- `tests/unit/feedback-email.test.ts`
- `tests/unit/application-emails.test.ts`
- `tests/unit/appointment-emails.test.ts`
- `tests/unit/complaint-emails.test.ts`
- `tests/unit/assistance-emails.test.ts`

**Modified:**
- `src/features/feedback/actions.ts` — `submitFeedback` sends the staff alert.
- `src/features/services/actions.ts` — `submitApplication` sends the submission receipt.
- `src/features/admin/actions/applications.ts` — `createWalkInApplication` sends the
  submission receipt; `reviewApplication` sends the approved/rejected notice.
- `src/features/appointments/actions.ts` — `submitAppointment` sends the submission
  receipt.
- `src/features/admin/actions/appointments.ts` — `createWalkInAppointment` sends the
  submission receipt; `reviewAppointment` sends the confirmed/declined notice.
- `src/features/complaints/actions.ts` — `submitComplaint` sends the submission receipt.
- `src/features/admin/actions/complaints.ts` — `createWalkInComplaint` sends the
  submission receipt; `reviewComplaint` sends the dismissed notice; `closeComplaint` sends
  the resolved/dismissed notice.
- `src/features/assistance/actions.ts` — `submitAssistance` sends the submission receipt.
- `src/features/admin/actions/assistance.ts` — `createWalkInAssistance` sends the
  submission receipt; `reviewAssistance` sends the declined notice; `decideAssistance`
  sends the granted/declined notice.
- `CLAUDE.md`, `docs/BACKEND_HANDOFF.md` — documentation (Task 7).

---

### Task 1: Shared email helpers — `periodLabel`/`excerpt` + `<TicketNotice>`

**Files:**
- Create: `src/emails/shared/text.ts`
- Create: `src/emails/shared/TicketNotice.tsx`
- Test: `tests/unit/email-shared-text.test.ts`
- Test: `tests/unit/ticket-notice.test.ts`

**Interfaces:**
- Produces: `periodLabel(period: "am" | "pm"): string`, `excerpt(text: string, maxLen?: number): string`
  (both from `@/emails/shared/text`); `TicketNotice` component + `TicketNoticeProps`/
  `TicketNoticeDetailLine` types (from `@/emails/shared/TicketNotice`) — every later task's
  templates import both.

- [ ] **Step 1: Write the failing test for the pure helpers**

Create `tests/unit/email-shared-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { excerpt, periodLabel } from "@/emails/shared/text";

describe("periodLabel", () => {
  it("labels a morning slot", () => {
    expect(periodLabel("am")).toBe("Morning (8:00 AM – 12:00 NN)");
  });

  it("labels an afternoon slot", () => {
    expect(periodLabel("pm")).toBe("Afternoon (1:00 PM – 5:00 PM)");
  });
});

describe("excerpt", () => {
  it("returns short text unchanged", () => {
    expect(excerpt("Short text")).toBe("Short text");
  });

  it("truncates long text and appends an ellipsis", () => {
    const long = "a".repeat(250);
    const result = excerpt(long, 200);
    expect(result).toBe(`${"a".repeat(200)}…`);
    expect(result.length).toBe(201);
  });

  it("trims surrounding whitespace before measuring length", () => {
    expect(excerpt("  padded  ", 20)).toBe("padded");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- email-shared-text`
Expected: FAIL — `Cannot find module '@/emails/shared/text'`

- [ ] **Step 3: Implement the helpers**

Create `src/emails/shared/text.ts`:

```ts
/** Period label matching the exact copy `/track` already uses for a confirmed slot. */
export function periodLabel(period: "am" | "pm"): string {
  return period === "am" ? "Morning (8:00 AM – 12:00 NN)" : "Afternoon (1:00 PM – 5:00 PM)";
}

/** Truncates long free text for an email body, appending an ellipsis when cut. */
export function excerpt(text: string, maxLen = 200): string {
  const trimmed = text.trim();
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen).trimEnd()}…` : trimmed;
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- email-shared-text`
Expected: PASS

- [ ] **Step 5: Write the failing test for `<TicketNotice>`**

Create `tests/unit/ticket-notice.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { TicketNotice } from "@/emails/shared/TicketNotice";

describe("TicketNotice", () => {
  it("renders the greeting, headline, ticket number, detail lines, and track link", async () => {
    const html = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application received",
        headline: "Application received",
        intro: "We received your application.",
        ticketNo: "APP-2026-00001",
        detailLines: [{ label: "Purpose", value: "Barangay Clearance" }],
        trackHref: "/track?ticket=APP-2026-00001",
      }),
    );

    expect(html).toContain("Maria");
    expect(html).toContain("Application received");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("/track?ticket=APP-2026-00001");
  });

  it("renders remarks under the given label when present, and omits the block when absent", async () => {
    const withRemarks = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application update",
        headline: "Your application was not approved",
        intro: "We reviewed your application.",
        ticketNo: "APP-2026-00002",
        remarksLabel: "Reason",
        remarks: "Missing valid ID.",
        trackHref: "/track?ticket=APP-2026-00002",
      }),
    );
    expect(withRemarks).toContain("Reason");
    expect(withRemarks).toContain("Missing valid ID.");

    const withoutRemarks = await render(
      createElement(TicketNotice, {
        firstName: "Maria",
        previewText: "Application received",
        headline: "Application received",
        intro: "We received your application.",
        ticketNo: "APP-2026-00003",
        trackHref: "/track?ticket=APP-2026-00003",
      }),
    );
    expect(withoutRemarks).not.toContain("Reason");
  });
});
```

- [ ] **Step 6: Run it, confirm it fails**

Run: `npm run test:unit -- ticket-notice`
Expected: FAIL — `Cannot find module '@/emails/shared/TicketNotice'`

- [ ] **Step 7: Implement `<TicketNotice>`**

Create `src/emails/shared/TicketNotice.tsx`:

```tsx
import { Button, Text } from "react-email";
import { EmailLayout } from "../EmailLayout";
import { EMAIL_SITE_URL } from "../site-url";

export interface TicketNoticeDetailLine {
  label: string;
  value: string;
}

export interface TicketNoticeProps {
  firstName: string;
  previewText: string;
  headline: string;
  intro: string;
  ticketNo: string;
  detailLines?: TicketNoticeDetailLine[];
  remarksLabel?: string;
  remarks?: string | null;
  closingNote?: string;
  trackHref: string;
}

/**
 * Shared body for every resident-facing ticket email — submission receipts and
 * status-change notices across all four ticketing flows. The email equivalent
 * of EmailLayout being the one wrapper: one place owns the ticket-number
 * treatment and the "Track this ticket" button so 12 near-identical templates
 * don't hand-roll the same markup.
 */
export function TicketNotice({
  firstName,
  previewText,
  headline,
  intro,
  ticketNo,
  detailLines = [],
  remarksLabel = "Remarks",
  remarks,
  closingNote,
  trackHref,
}: TicketNoticeProps) {
  return (
    <EmailLayout previewText={previewText}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {firstName},</Text>
      <Text style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{headline}</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{intro}</Text>
      <Text
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "0 0 4px",
          color: "#6b6255",
        }}
      >
        Ticket number
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", color: "#b45309" }}>
        {ticketNo}
      </Text>
      {detailLines.map((line) => (
        <Text key={line.label} style={{ fontSize: 14, margin: "0 0 4px" }}>
          <strong>{line.label}:</strong> {line.value}
        </Text>
      ))}
      {remarks ? (
        <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "16px 0 0" }}>
          <strong>{remarksLabel}:</strong> {remarks}
        </Text>
      ) : null}
      {closingNote ? (
        <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "16px 0" }}>{closingNote}</Text>
      ) : null}
      <Button
        href={`${EMAIL_SITE_URL}${trackHref}`}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Track this ticket
      </Button>
    </EmailLayout>
  );
}
```

- [ ] **Step 8: Run it, confirm it passes**

Run: `npm run test:unit -- ticket-notice`
Expected: PASS

- [ ] **Step 9: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors

```bash
git add src/emails/shared/text.ts src/emails/shared/TicketNotice.tsx tests/unit/email-shared-text.test.ts tests/unit/ticket-notice.test.ts
git commit -m "feat: add shared ticket-notice email component and helpers"
```

---

### Task 2: Feedback staff alert

**Files:**
- Create: `src/emails/FeedbackStaffNotifyEmail.tsx`
- Test: `tests/unit/feedback-email.test.ts`
- Modify: `src/features/feedback/actions.ts`

**Interfaces:**
- Consumes: `sendEmail` (`@/lib/email`), `staffEmailsFor` (`@/lib/notifications`),
  `feedbackCategoryLabel` (`@/features/feedback/data`).
- Produces: `FeedbackStaffNotifyEmail` component (from `@/emails/FeedbackStaffNotifyEmail`).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/feedback-email.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { FeedbackStaffNotifyEmail } from "@/emails/FeedbackStaffNotifyEmail";

describe("FeedbackStaffNotifyEmail", () => {
  it("includes the category, subject, message, and a link to the specific feedback report", async () => {
    const html = await render(
      createElement(FeedbackStaffNotifyEmail, {
        category: "Bug Report",
        subject: "Broken image on /about",
        message: "The captain's photo does not load.",
        feedbackId: "fb-123",
      }),
    );

    expect(html).toContain("Bug Report");
    expect(html).toContain("Broken image on /about");
    expect(html).toContain("The captain&#x27;s photo does not load.");
    expect(html).toContain("/admin/inquiries?tab=feedback&amp;review=fb-123");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- feedback-email`
Expected: FAIL — `Cannot find module '@/emails/FeedbackStaffNotifyEmail'`

- [ ] **Step 3: Implement the template**

Create `src/emails/FeedbackStaffNotifyEmail.tsx`:

```tsx
import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface FeedbackStaffNotifyEmailProps {
  category: string;
  subject: string;
  message: string;
  feedbackId: string;
}

export function FeedbackStaffNotifyEmail({
  category,
  subject,
  message,
  feedbackId,
}: FeedbackStaffNotifyEmailProps) {
  return (
    <EmailLayout previewText={`New feedback: ${subject}`}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>New website feedback</Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Category:</strong> {category}
      </Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Subject:</strong> {subject}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</Text>
      <Button
        href={`${EMAIL_SITE_URL}/admin/inquiries?tab=feedback&review=${feedbackId}`}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        View in admin portal
      </Button>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- feedback-email`
Expected: PASS

- [ ] **Step 5: Wire `submitFeedback`**

In `src/features/feedback/actions.ts`, add three imports alongside the existing ones:

```ts
import { sendEmail } from "@/lib/email";
import { staffEmailsFor } from "@/lib/notifications";
import { feedbackCategoryLabel } from "./data";
import { FeedbackStaffNotifyEmail } from "@/emails/FeedbackStaffNotifyEmail";
```

Replace the insert block (currently `const { error } = await admin.from("feedback").insert({...})` with no `.select()`) with:

```ts
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .insert({
      category: parsed.data.category,
      subject: parsed.data.subject,
      message: parsed.data.message,
      // 0 crosses the boundary as "not rated"; the column stores null so it stays
      // out of every average.
      rating: parsed.data.rating === 0 ? null : parsed.data.rating,
      page_path: parsed.data.pagePath,
      screenshot_path: screenshotPath,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Compensating delete: without this the object outlives the row that was
    // supposed to reference it, which is exactly the orphan the deferred-upload
    // rule exists to prevent.
    await discardFeedbackScreenshot(screenshotPath, "submitFeedback insert failed");
    console.error("submitFeedback failed:", error?.message);
    return { error: "We could not send your feedback. Please try again." };
  }

  // Best-effort: the feedback row is already saved above, so a Resend outage or
  // nobody currently holding handle-inquiries must never surface as an error to
  // the (anonymous) submitter — sendEmail()/staffEmailsFor() both fail open.
  const staffEmails = await staffEmailsFor("handle-inquiries");
  if (staffEmails.length > 0) {
    await sendEmail({
      to: staffEmails,
      subject: `New feedback: ${parsed.data.subject}`,
      template: FeedbackStaffNotifyEmail({
        category: feedbackCategoryLabel(parsed.data.category),
        subject: parsed.data.subject,
        message: parsed.data.message,
        feedbackId: data.id,
      }),
    });
  }

  return { error: null };
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/emails/FeedbackStaffNotifyEmail.tsx tests/unit/feedback-email.test.ts src/features/feedback/actions.ts
git commit -m "feat: notify handle-inquiries staff by email when feedback arrives"
```

---

### Task 3: Applications — submission receipt + approved/rejected notices

**Files:**
- Create: `src/emails/ApplicationSubmittedEmail.tsx`, `ApplicationApprovedEmail.tsx`,
  `ApplicationRejectedEmail.tsx`
- Test: `tests/unit/application-emails.test.ts`
- Modify: `src/features/services/actions.ts` (`submitApplication`)
- Modify: `src/features/admin/actions/applications.ts` (`createWalkInApplication`,
  `reviewApplication`)

**Interfaces:**
- Consumes: `TicketNotice` (Task 1), `sendEmail` (`@/lib/email`).
- Produces: `ApplicationSubmittedEmail`, `ApplicationApprovedEmail`,
  `ApplicationRejectedEmail` components.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/application-emails.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { ApplicationApprovedEmail } from "@/emails/ApplicationApprovedEmail";
import { ApplicationRejectedEmail } from "@/emails/ApplicationRejectedEmail";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";

describe("ApplicationSubmittedEmail", () => {
  it("includes the resident's name, ticket number, document, purpose, and track link", async () => {
    const html = await render(
      createElement(ApplicationSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        purpose: "Employment requirement",
      }),
    );

    expect(html).toContain("Maria");
    expect(html).toContain("APP-2026-00001");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("Employment requirement");
    expect(html).toContain("/track?ticket=APP-2026-00001");
  });
});

describe("ApplicationApprovedEmail", () => {
  it("tells the resident their document is ready to claim", async () => {
    const html = await render(
      createElement(ApplicationApprovedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
      }),
    );

    expect(html).toContain("approved");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("APP-2026-00001");
  });
});

describe("ApplicationRejectedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(ApplicationRejectedEmail, {
        firstName: "Maria",
        ticketNo: "APP-2026-00001",
        serviceTitle: "Barangay Clearance",
        remarks: "Missing valid ID.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Missing valid ID.");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- application-emails`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the three templates**

Create `src/emails/ApplicationSubmittedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  purpose: string;
}

export function ApplicationSubmittedEmail({
  firstName,
  ticketNo,
  serviceTitle,
  purpose,
}: ApplicationSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Application received — ${ticketNo}`}
      headline="Application received"
      intro="We received your application. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Document", value: serviceTitle },
        { label: "Purpose", value: purpose },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/ApplicationApprovedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationApprovedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
}

export function ApplicationApprovedEmail({
  firstName,
  ticketNo,
  serviceTitle,
}: ApplicationApprovedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your application is ready to claim — ${ticketNo}`}
      headline="Your application was approved"
      intro={`Your ${serviceTitle} is ready to claim at the barangay hall.`}
      ticketNo={ticketNo}
      closingNote="Bring a valid ID when you claim it."
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/ApplicationRejectedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationRejectedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  remarks: string;
}

export function ApplicationRejectedEmail({
  firstName,
  ticketNo,
  serviceTitle,
  remarks,
}: ApplicationRejectedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your application — ${ticketNo}`}
      headline="Your application was not approved"
      intro={`We reviewed your ${serviceTitle} application and could not approve it.`}
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- application-emails`
Expected: PASS

- [ ] **Step 5: Wire `submitApplication`** (`src/features/services/actions.ts`)

Change the service lookup's `.select(...)` from `"id, is_available, tone"` to
`"id, is_available, tone, title"`.

Add imports:

```ts
import { sendEmail } from "@/lib/email";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";
```

Immediately before the final `return { error: null, ticketNo: data.ticket_no };`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Application received — ${data.ticket_no}`,
      template: ApplicationSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        serviceTitle: service.title,
        purpose: parsed.data.purpose,
      }),
    });
  }
```

- [ ] **Step 6: Wire `createWalkInApplication`** (`src/features/admin/actions/applications.ts`)

Change its service lookup's `.select(...)` from `"id, tone"` to `"id, tone, title"`.

Add imports at the top of the file:

```ts
import { sendEmail } from "@/lib/email";
import { ApplicationSubmittedEmail } from "@/emails/ApplicationSubmittedEmail";
```

Immediately before `await recordActivity(actor, { type: "create", action: "encoded walk-in application", ...`
in `createWalkInApplication`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Application received — ${data.ticket_no}`,
      template: ApplicationSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        serviceTitle: service.title,
        purpose: parsed.data.purpose,
      }),
    });
  }
```

- [ ] **Step 7: Wire `reviewApplication`** (same file)

Add `ApplicationApprovedEmail`/`ApplicationRejectedEmail` to the import line added in Step 6.

Change the update's `.select("ticket_no")` to `.select("ticket_no, email, first_name, services (title)")`.

Immediately after `const approved = parsed.data.status === "approved";` (before the
`recordActivity` call), insert:

```ts
  if (data.email) {
    const service = data.services as unknown as { title: string } | null;
    const serviceTitle = service?.title ?? "document";
    await sendEmail({
      to: data.email,
      subject: approved
        ? `Your application is ready to claim — ${data.ticket_no}`
        : `Update on your application — ${data.ticket_no}`,
      template: approved
        ? ApplicationApprovedEmail({ firstName: data.first_name, ticketNo: data.ticket_no, serviceTitle })
        : ApplicationRejectedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            serviceTitle,
            remarks: parsed.data.remarks,
          }),
    });
  }
```

`releaseApplication` is untouched — the design's table explicitly skips that transition
(resident is at the counter when it fires).

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/emails/ApplicationSubmittedEmail.tsx src/emails/ApplicationApprovedEmail.tsx src/emails/ApplicationRejectedEmail.tsx tests/unit/application-emails.test.ts src/features/services/actions.ts src/features/admin/actions/applications.ts
git commit -m "feat: email application submission receipts and approved/rejected notices"
```

---

### Task 4: Appointments — submission receipt + confirmed/declined notices

**Files:**
- Create: `src/emails/AppointmentSubmittedEmail.tsx`, `AppointmentConfirmedEmail.tsx`,
  `AppointmentDeclinedEmail.tsx`
- Test: `tests/unit/appointment-emails.test.ts`
- Modify: `src/features/appointments/actions.ts` (`submitAppointment`)
- Modify: `src/features/admin/actions/appointments.ts` (`createWalkInAppointment`,
  `reviewAppointment`)

**Interfaces:**
- Consumes: `TicketNotice`, `periodLabel` (Task 1), `formatDate` (`@/lib/format`,
  pre-existing), `sendEmail`.
- Produces: `AppointmentSubmittedEmail`, `AppointmentConfirmedEmail`,
  `AppointmentDeclinedEmail` components.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/appointment-emails.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AppointmentConfirmedEmail } from "@/emails/AppointmentConfirmedEmail";
import { AppointmentDeclinedEmail } from "@/emails/AppointmentDeclinedEmail";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";

describe("AppointmentSubmittedEmail", () => {
  it("includes the purpose and the requested schedule with a period label", async () => {
    const html = await render(
      createElement(AppointmentSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        purpose: "Renew business permit",
        preferredDate: "2026-08-15",
        preferredPeriod: "am",
      }),
    );

    expect(html).toContain("Renew business permit");
    expect(html).toContain("Morning (8:00 AM");
    expect(html).toContain("APT-2026-00001");
  });
});

describe("AppointmentConfirmedEmail", () => {
  it("includes the confirmed schedule", async () => {
    const html = await render(
      createElement(AppointmentConfirmedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        confirmedDate: "2026-08-16",
        confirmedPeriod: "pm",
      }),
    );

    expect(html).toContain("confirmed");
    expect(html).toContain("Afternoon (1:00 PM");
  });
});

describe("AppointmentDeclinedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(AppointmentDeclinedEmail, {
        firstName: "Maria",
        ticketNo: "APT-2026-00001",
        remarks: "Fully booked that week.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Fully booked that week.");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- appointment-emails`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the three templates**

Create `src/emails/AppointmentSubmittedEmail.tsx`:

```tsx
import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";
import { periodLabel } from "./shared/text";

export interface AppointmentSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  purpose: string;
  preferredDate: string;
  preferredPeriod: "am" | "pm";
}

export function AppointmentSubmittedEmail({
  firstName,
  ticketNo,
  purpose,
  preferredDate,
  preferredPeriod,
}: AppointmentSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Appointment request received — ${ticketNo}`}
      headline="Appointment request received"
      intro="We received your appointment request. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Purpose", value: purpose },
        {
          label: "Requested schedule",
          value: `${formatDate(preferredDate)} · ${periodLabel(preferredPeriod)}`,
        },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/AppointmentConfirmedEmail.tsx`:

```tsx
import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";
import { periodLabel } from "./shared/text";

export interface AppointmentConfirmedEmailProps {
  firstName: string;
  ticketNo: string;
  confirmedDate: string;
  confirmedPeriod: "am" | "pm";
}

export function AppointmentConfirmedEmail({
  firstName,
  ticketNo,
  confirmedDate,
  confirmedPeriod,
}: AppointmentConfirmedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your appointment is confirmed — ${ticketNo}`}
      headline="Your appointment is confirmed"
      intro="Barangay staff confirmed your appointment. This may be a different date or time than you requested — please check the schedule below."
      ticketNo={ticketNo}
      detailLines={[
        {
          label: "Confirmed schedule",
          value: `${formatDate(confirmedDate)} · ${periodLabel(confirmedPeriod)}`,
        },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/AppointmentDeclinedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface AppointmentDeclinedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function AppointmentDeclinedEmail({
  firstName,
  ticketNo,
  remarks,
}: AppointmentDeclinedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your appointment request — ${ticketNo}`}
      headline="Your appointment request was declined"
      intro="We reviewed your appointment request and could not accommodate it."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- appointment-emails`
Expected: PASS

- [ ] **Step 5: Wire `submitAppointment`** (`src/features/appointments/actions.ts`)

Add imports:

```ts
import { sendEmail } from "@/lib/email";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";
```

Immediately before the final `return { error: null, ticketNo: data.ticket_no };`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Appointment request received — ${data.ticket_no}`,
      template: AppointmentSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        purpose: parsed.data.purpose,
        preferredDate: parsed.data.preferredDate,
        preferredPeriod: parsed.data.preferredPeriod,
      }),
    });
  }
```

- [ ] **Step 6: Wire `createWalkInAppointment`** (`src/features/admin/actions/appointments.ts`)

Add imports at the top of the file:

```ts
import { sendEmail } from "@/lib/email";
import { AppointmentConfirmedEmail } from "@/emails/AppointmentConfirmedEmail";
import { AppointmentDeclinedEmail } from "@/emails/AppointmentDeclinedEmail";
import { AppointmentSubmittedEmail } from "@/emails/AppointmentSubmittedEmail";
```

Immediately before `await recordActivity(actor, { type: "create", action: "encoded walk-in appointment", ...`
in `createWalkInAppointment`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Appointment request received — ${data.ticket_no}`,
      template: AppointmentSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        purpose: parsed.data.purpose,
        preferredDate: parsed.data.preferredDate,
        preferredPeriod: parsed.data.preferredPeriod,
      }),
    });
  }
```

- [ ] **Step 7: Wire `reviewAppointment`** (same file)

Change the update's `.select("ticket_no")` to `.select("ticket_no, email, first_name")`.

Immediately after `const confirmed = parsed.data.status === "confirmed";` (before the
`recordActivity` call), insert:

```ts
  if (data.email) {
    await sendEmail({
      to: data.email,
      subject: confirmed
        ? `Your appointment is confirmed — ${data.ticket_no}`
        : `Update on your appointment request — ${data.ticket_no}`,
      template: confirmed
        ? AppointmentConfirmedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            confirmedDate: parsed.data.confirmedDate,
            confirmedPeriod: parsed.data.confirmedPeriod as "am" | "pm",
          })
        : AppointmentDeclinedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks,
          }),
    });
  }
```

The `as "am" | "pm"` cast is safe: the schema's own `.refine()` above already guarantees
`confirmedPeriod` is non-`""` whenever `status === "confirmed"` — the same guarantee the
existing `confirmed_period: parsed.data.status === "confirmed" ? parsed.data.confirmedPeriod : null`
line a few lines up already relies on.

`completeAppointment` is untouched — no email on that transition per the design table.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/emails/AppointmentSubmittedEmail.tsx src/emails/AppointmentConfirmedEmail.tsx src/emails/AppointmentDeclinedEmail.tsx tests/unit/appointment-emails.test.ts src/features/appointments/actions.ts src/features/admin/actions/appointments.ts
git commit -m "feat: email appointment submission receipts and confirmed/declined notices"
```

---

### Task 5: Complaints — submission receipt + resolved/dismissed notices

**Files:**
- Create: `src/emails/ComplaintSubmittedEmail.tsx`, `ComplaintResolvedEmail.tsx`,
  `ComplaintDismissedEmail.tsx`
- Test: `tests/unit/complaint-emails.test.ts`
- Modify: `src/features/complaints/actions.ts` (`submitComplaint`)
- Modify: `src/features/admin/actions/complaints.ts` (`createWalkInComplaint`,
  `reviewComplaint`, `closeComplaint`)

**Interfaces:**
- Consumes: `TicketNotice` (Task 1), `formatDate` (`@/lib/format`), `sendEmail`.
- Produces: `ComplaintSubmittedEmail`, `ComplaintResolvedEmail`, `ComplaintDismissedEmail`
  components.

**Note on scope:** the complaint's `narrative`, `respondent`, and full `location` detail
are deliberately **not** echoed into `ComplaintSubmittedEmail` beyond the incident date and
location line below. `TicketLookupResult` (see `src/types/index.ts`'s own doc comment)
already establishes that a complaint shows "status only" everywhere outside the admin
portal, specifically because the narrative can name a respondent — keep that same
restraint here rather than re-exposing the full narrative in a channel `/track` was
deliberately built not to.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/complaint-emails.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { ComplaintDismissedEmail } from "@/emails/ComplaintDismissedEmail";
import { ComplaintResolvedEmail } from "@/emails/ComplaintResolvedEmail";
import { ComplaintSubmittedEmail } from "@/emails/ComplaintSubmittedEmail";

describe("ComplaintSubmittedEmail", () => {
  it("includes the incident date and location", async () => {
    const html = await render(
      createElement(ComplaintSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        incidentDate: "2026-07-20",
        location: "Purok 3",
      }),
    );

    expect(html).toContain("Purok 3");
    expect(html).toContain("CMP-2026-00001");
  });
});

describe("ComplaintResolvedEmail", () => {
  it("renders without remarks when none were given", async () => {
    const html = await render(
      createElement(ComplaintResolvedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        remarks: null,
      }),
    );

    expect(html).toContain("resolved");
    expect(html).not.toContain("Notes:");
  });
});

describe("ComplaintDismissedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(ComplaintDismissedEmail, {
        firstName: "Maria",
        ticketNo: "CMP-2026-00001",
        remarks: "Could not be substantiated.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Could not be substantiated.");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- complaint-emails`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the three templates**

Create `src/emails/ComplaintSubmittedEmail.tsx`:

```tsx
import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  incidentDate: string;
  location: string;
}

export function ComplaintSubmittedEmail({
  firstName,
  ticketNo,
  incidentDate,
  location,
}: ComplaintSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Report filed — ${ticketNo}`}
      headline="Report filed"
      intro="We received your report. Keep this ticket number, with your last name, to check its status at any time — tracking shows status only, never the details you wrote."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Date of incident", value: formatDate(incidentDate) },
        { label: "Location", value: location },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/ComplaintResolvedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintResolvedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string | null;
}

export function ComplaintResolvedEmail({ firstName, ticketNo, remarks }: ComplaintResolvedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your report has been resolved — ${ticketNo}`}
      headline="Your report has been resolved"
      intro="Barangay staff have resolved your report."
      ticketNo={ticketNo}
      remarksLabel="Notes"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/ComplaintDismissedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintDismissedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function ComplaintDismissedEmail({ firstName, ticketNo, remarks }: ComplaintDismissedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your report — ${ticketNo}`}
      headline="Your report was dismissed"
      intro="We reviewed your report and it has been dismissed."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- complaint-emails`
Expected: PASS

- [ ] **Step 5: Wire `submitComplaint`** (`src/features/complaints/actions.ts`)

Add imports:

```ts
import { sendEmail } from "@/lib/email";
import { ComplaintSubmittedEmail } from "@/emails/ComplaintSubmittedEmail";
```

Immediately before the final `return { error: null, ticketNo: data.ticket_no };`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Report filed — ${data.ticket_no}`,
      template: ComplaintSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        incidentDate: parsed.data.incidentDate,
        location: parsed.data.location,
      }),
    });
  }
```

- [ ] **Step 6: Wire `createWalkInComplaint`** (`src/features/admin/actions/complaints.ts`)

Add imports at the top of the file:

```ts
import { sendEmail } from "@/lib/email";
import { ComplaintDismissedEmail } from "@/emails/ComplaintDismissedEmail";
import { ComplaintResolvedEmail } from "@/emails/ComplaintResolvedEmail";
import { ComplaintSubmittedEmail } from "@/emails/ComplaintSubmittedEmail";
```

Immediately before `await recordActivity(actor, { type: "create", action: "encoded walk-in complaint", ...`
in `createWalkInComplaint`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Report filed — ${data.ticket_no}`,
      template: ComplaintSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        incidentDate: parsed.data.incidentDate,
        location: parsed.data.location,
      }),
    });
  }
```

- [ ] **Step 7: Wire `reviewComplaint`** (same file)

Change the update's `.select("ticket_no")` to `.select("ticket_no, email, first_name")`.

Immediately after `const dismissed = parsed.data.status === "dismissed";` (before the
`recordActivity` call), insert:

```ts
  if (data.email && dismissed) {
    await sendEmail({
      to: data.email,
      subject: `Update on your report — ${data.ticket_no}`,
      template: ComplaintDismissedEmail({
        firstName: data.first_name,
        ticketNo: data.ticket_no,
        remarks: parsed.data.remarks,
      }),
    });
  }
```

No email on the `under-review` branch — that is an internal status move, per the design
table.

- [ ] **Step 8: Wire `closeComplaint`** (same file)

Change its update's `.select("ticket_no")` to `.select("ticket_no, email, first_name")`.

Immediately after `const resolved = parsed.data.status === "resolved";` (before the
`recordActivity` call), insert:

```ts
  if (data.email) {
    await sendEmail({
      to: data.email,
      subject: resolved
        ? `Your report has been resolved — ${data.ticket_no}`
        : `Update on your report — ${data.ticket_no}`,
      template: resolved
        ? ComplaintResolvedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks || null,
          })
        : ComplaintDismissedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks,
          }),
    });
  }
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/emails/ComplaintSubmittedEmail.tsx src/emails/ComplaintResolvedEmail.tsx src/emails/ComplaintDismissedEmail.tsx tests/unit/complaint-emails.test.ts src/features/complaints/actions.ts src/features/admin/actions/complaints.ts
git commit -m "feat: email complaint submission receipts and resolved/dismissed notices"
```

---

### Task 6: Assistance — submission receipt + granted/declined notices

**Files:**
- Create: `src/emails/AssistanceSubmittedEmail.tsx`, `AssistanceGrantedEmail.tsx`,
  `AssistanceDeclinedEmail.tsx`
- Test: `tests/unit/assistance-emails.test.ts`
- Modify: `src/features/assistance/actions.ts` (`submitAssistance`)
- Modify: `src/features/admin/actions/assistance.ts` (`createWalkInAssistance`,
  `reviewAssistance`, `decideAssistance`)

**Interfaces:**
- Consumes: `TicketNotice`, `excerpt` (Task 1), `sendEmail`.
- Produces: `AssistanceSubmittedEmail`, `AssistanceGrantedEmail`, `AssistanceDeclinedEmail`
  components.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/assistance-emails.test.ts`:

```tsx
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AssistanceDeclinedEmail } from "@/emails/AssistanceDeclinedEmail";
import { AssistanceGrantedEmail } from "@/emails/AssistanceGrantedEmail";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";

describe("AssistanceSubmittedEmail", () => {
  it("includes the category and a truncated details excerpt", async () => {
    const html = await render(
      createElement(AssistanceSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        categoryLabel: "Medical Assistance",
        details: "a".repeat(300),
      }),
    );

    expect(html).toContain("Medical Assistance");
    expect(html).toContain("AST-2026-00001");
    expect(html).toContain(`${"a".repeat(200)}…`);
  });
});

describe("AssistanceGrantedEmail", () => {
  it("names the category in the intro", async () => {
    const html = await render(
      createElement(AssistanceGrantedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        categoryLabel: "Medical Assistance",
        remarks: null,
      }),
    );

    expect(html).toContain("granted");
    expect(html).toContain("Medical Assistance");
  });
});

describe("AssistanceDeclinedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(AssistanceDeclinedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        remarks: "Does not meet the eligibility criteria.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Does not meet the eligibility criteria.");
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test:unit -- assistance-emails`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement the three templates**

Create `src/emails/AssistanceSubmittedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";
import { excerpt } from "./shared/text";

export interface AssistanceSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  categoryLabel: string;
  details: string;
}

export function AssistanceSubmittedEmail({
  firstName,
  ticketNo,
  categoryLabel,
  details,
}: AssistanceSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Assistance request received — ${ticketNo}`}
      headline="Assistance request received"
      intro="We received your request. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Type of assistance", value: categoryLabel },
        { label: "Details", value: excerpt(details) },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/AssistanceGrantedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface AssistanceGrantedEmailProps {
  firstName: string;
  ticketNo: string;
  categoryLabel: string;
  remarks: string | null;
}

export function AssistanceGrantedEmail({
  firstName,
  ticketNo,
  categoryLabel,
  remarks,
}: AssistanceGrantedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your assistance request was granted — ${ticketNo}`}
      headline="Your assistance request was granted"
      intro={`Your request for ${categoryLabel} was granted. Please visit the barangay hall for next steps.`}
      ticketNo={ticketNo}
      remarksLabel="Notes"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

Create `src/emails/AssistanceDeclinedEmail.tsx`:

```tsx
import { TicketNotice } from "./shared/TicketNotice";

export interface AssistanceDeclinedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function AssistanceDeclinedEmail({
  firstName,
  ticketNo,
  remarks,
}: AssistanceDeclinedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your assistance request — ${ticketNo}`}
      headline="Your assistance request was declined"
      intro="We reviewed your request and could not grant it."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test:unit -- assistance-emails`
Expected: PASS

- [ ] **Step 5: Wire `submitAssistance`** (`src/features/assistance/actions.ts`)

Change the category lookup's `.select(...)` from `"id, is_active"` to
`"id, is_active, label"`.

Add imports:

```ts
import { sendEmail } from "@/lib/email";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";
```

Immediately before the final `return { error: null, ticketNo: data.ticket_no };`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Assistance request received — ${data.ticket_no}`,
      template: AssistanceSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        categoryLabel: category.label,
        details: parsed.data.details,
      }),
    });
  }
```

- [ ] **Step 6: Wire `createWalkInAssistance`** (`src/features/admin/actions/assistance.ts`)

Change its category lookup's `.select(...)` from `"id, is_active"` to
`"id, is_active, label"`.

Add imports at the top of the file:

```ts
import { sendEmail } from "@/lib/email";
import { AssistanceDeclinedEmail } from "@/emails/AssistanceDeclinedEmail";
import { AssistanceGrantedEmail } from "@/emails/AssistanceGrantedEmail";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";
```

Immediately before `await recordActivity(actor, { type: "create", action: "encoded walk-in assistance request", ...`
in `createWalkInAssistance`, insert:

```ts
  if (parsed.data.email) {
    await sendEmail({
      to: parsed.data.email,
      subject: `Assistance request received — ${data.ticket_no}`,
      template: AssistanceSubmittedEmail({
        firstName: parsed.data.firstName,
        ticketNo: data.ticket_no,
        categoryLabel: category.label,
        details: parsed.data.details,
      }),
    });
  }
```

- [ ] **Step 7: Wire `reviewAssistance`** (same file)

Change the update's `.select("ticket_no")` to `.select("ticket_no, email, first_name")`.

Immediately after `const declined = parsed.data.status === "declined";` (before the
`recordActivity` call), insert:

```ts
  if (data.email && declined) {
    await sendEmail({
      to: data.email,
      subject: `Update on your assistance request — ${data.ticket_no}`,
      template: AssistanceDeclinedEmail({
        firstName: data.first_name,
        ticketNo: data.ticket_no,
        remarks: parsed.data.remarks,
      }),
    });
  }
```

No email on the `under-review` branch, per the design table.

- [ ] **Step 8: Wire `decideAssistance`** (same file)

Change its update's `.select("ticket_no")` to
`.select("ticket_no, email, first_name, assistance_categories (label)")`.

Immediately after `const granted = parsed.data.status === "granted";` (before the
`recordActivity` call), insert:

```ts
  if (data.email) {
    const category = data.assistance_categories as unknown as { label: string } | null;
    await sendEmail({
      to: data.email,
      subject: granted
        ? `Your assistance request was granted — ${data.ticket_no}`
        : `Update on your assistance request — ${data.ticket_no}`,
      template: granted
        ? AssistanceGrantedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            categoryLabel: category?.label ?? "assistance",
            remarks: parsed.data.remarks || null,
          })
        : AssistanceDeclinedEmail({
            firstName: data.first_name,
            ticketNo: data.ticket_no,
            remarks: parsed.data.remarks,
          }),
    });
  }
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add src/emails/AssistanceSubmittedEmail.tsx src/emails/AssistanceGrantedEmail.tsx src/emails/AssistanceDeclinedEmail.tsx tests/unit/assistance-emails.test.ts src/features/assistance/actions.ts src/features/admin/actions/assistance.ts
git commit -m "feat: email assistance submission receipts and granted/declined notices"
```

---

### Task 7: Full verification, docs, and CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/BACKEND_HANDOFF.md`

- [ ] **Step 1: Run the full unit suite**

Run: `npm run test:unit`
Expected: PASS — every test from Tasks 1-6, plus every pre-existing test, green.

- [ ] **Step 2: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors

- [ ] **Step 3: Manual pass with the `verify` skill**

`.env.local` has no `RESEND_API_KEY` set in this environment, so `sendEmail()` takes its
dev-skip path (one-time `console.warn`, never throws) — this is expected, not a bug (see
`src/lib/email.ts`). Using the `verify` skill: start the dev server, submit one form from
each of the four ticketing flows (`/services/apply/[slug]`, `/appointments/new`,
`/complaints/new` or the incident-report route, `/assistance/new`) with an email address
filled in, and submit one feedback report via the floating widget. Confirm:
- Each on-screen receipt still renders normally (email sending must never block or alter
  the resident-facing success state).
- The dev server console logs the one-time `sendEmail` dev-skip warning, not a thrown
  error or an unhandled rejection.
- No regression in `npm run test:e2e -- --project=public` (skip this if it was already
  run recently within the same rate-limit window per this project's known
  `feedback.spec.ts` collision — see CLAUDE.md's Commands section).

Then, as an admin user with the right permissions, drive one status transition per flow
(approve or reject an application, confirm or decline an appointment, dismiss or resolve a
complaint, grant or decline an assistance request) and confirm the same dev-skip warning
fires and the admin-side success toast is unaffected.

- [ ] **Step 4: Update CLAUDE.md**

In the existing "Transactional email (Resend), Plan 1 of 3: foundation, 2026-07-30" bullet,
append a new paragraph (keep the bullet's existing text as-is above it):

```
  **Plan 2 of 3: remaining triggers, 2026-07-30**
  (`docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`). Wires every
  trigger the design scoped to Plan 2: `submitFeedback` now emails every `handle-inquiries`
  holder via `FeedbackStaffNotifyEmail` (feedback stays anonymous — no resident-facing
  email, matching its no-PII design); all four ticketing flows' public submission actions
  (`submitApplication`, `submitAppointment`, `submitComplaint`, `submitAssistance`) and
  their walk-in siblings (`createWalkInApplication` and its three counterparts in
  `src/features/admin/actions/*.ts`) send a `<Flow>SubmittedEmail` receipt to the
  resident's email when one was given; and all 8 "final outcome" status-change admin
  actions (`reviewApplication`'s approved/rejected, `reviewAppointment`'s
  confirmed/declined, `reviewComplaint`'s dismissed + `closeComplaint`'s
  resolved/dismissed, `reviewAssistance`'s declined + `decideAssistance`'s
  granted/declined) send the matching notice — skipping the non-terminal
  `released`/`completed`/`under-review` transitions the design deliberately excluded.
  Every resident template composes a new shared component, `<TicketNotice>`
  (`src/emails/shared/TicketNotice.tsx`) — the "Track this ticket" button, the ticket-number
  treatment, and the optional remarks/detail-line rendering live there once rather than in
  12 near-identical files, the same DRY reasoning the design used to pick composed JSX
  templates over plain HTML strings in the first place. `src/emails/shared/text.ts` holds
  two small pure helpers reused across templates: `periodLabel()` (the exact
  "Morning (8:00 AM – 12:00 NN)" / "Afternoon (1:00 PM – 5:00 PM)" copy
  `src/features/track/actions.ts` already established, not a second wording of the same
  fact) and `excerpt()` (truncates a long free-text field — assistance's `details` — for an
  email body). A complaint's `narrative` and `respondent` are deliberately never echoed
  into `ComplaintSubmittedEmail` beyond the incident date and location: the same "status
  only" restraint `TicketLookupResult` already documents for why `/track` never surfaces a
  complaint's narrative applies here too, on principle, even though the email goes only to
  the reporter's own inbox. `staffEmailsFor()` needed no changes — Plan 1's final review
  already built and unit-tested it (`tests/unit/notifications.test.ts`) ahead of schedule.
  Every new send follows Plan 1's established shape exactly: `await`ed (never
  fire-and-forget), the resident's `email` column checked for null/`""` before sending (the
  same nullable handling the row insert itself already applies), and the caller never
  inspects `sendEmail()`'s return value. §2D's Plan 3 (delivery monitoring — `email_log` +
  the Resend webhook) is the only piece of the original design still open.
```

- [ ] **Step 5: Update `docs/BACKEND_HANDOFF.md`**

Four edits, each closing an annotation Plan 1 left open (`docs/BACKEND_HANDOFF.md:185-188`,
`:1214-1216`, `:1246-1249`, `:1335-1339` as of this plan's writing — re-locate by the quoted
text below if line numbers have drifted):

1. Replace (around line 184-188):

```
> category is retired). Each ends in an on-screen ticket-number receipt only —
> **no email is sent** (§2D was blocked on a Resend account; that account now exists and
> §2D's Plan 1, `docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`,
> shipped 2026-07-30, but it wired only the contact-inquiry form — see item A below. These
> four ticket flows' own submission receipts are still unbuilt, scoped to §2D's Plan 2).
```

with:

```
> category is retired). Each ends in an on-screen ticket-number receipt — **and now also an
> emailed one**, when the resident gave an email address (§2D's Plan 2,
> `docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`, shipped
> 2026-07-30 — see item 6 below).
```

2. Replace (around line 1214-1216):

```
this is what makes the form's "within 24-48 business hours" promise real. Both sends are
best-effort: `sendEmail()`/`staffEmailsFor()` fail open by construction (`src/lib/email.ts`,
`src/lib/notifications.ts`), so an email outage never turns into a failed submission. §2D's
Plan 2 (feedback's staff alert below, plus the four ticketing flows' own receipts) and Plan
3 (delivery monitoring) remain open.
```

with:

```
this is what makes the form's "within 24-48 business hours" promise real. Both sends are
best-effort: `sendEmail()`/`staffEmailsFor()` fail open by construction (`src/lib/email.ts`,
`src/lib/notifications.ts`), so an email outage never turns into a failed submission. §2D's
Plan 2 (feedback's staff alert, the four ticketing flows' own receipts and status notices —
`docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`) shipped 2026-07-30
too. Only Plan 3 (delivery monitoring) remains open.
```

3. Replace (around line 1245-1249):

```
**Still needed**:
- **Staff notification on arrival.** Nothing tells anyone a report came in; the queue is
  checked, not pushed. No longer blocked on Resend itself — §2D's Plan 1 (2026-07-30) built
  the send pipeline and `staffEmailsFor()` this trigger would reuse (see item A above) — but
  feedback's own trigger is unwired, scoped to §2D's Plan 2.
```

with:

```
**Still needed**:
- ~~**Staff notification on arrival.**~~ **BUILT 2026-07-30** (§2D Plan 2,
  `docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`). `submitFeedback`
  now emails every `handle-inquiries` holder via `FeedbackStaffNotifyEmail`, reusing
  `staffEmailsFor()` from item A above. Still no resident-facing email — feedback stays
  anonymous by design.
```

4. Replace (around line 1331-1339):

```
6. **Appointment / complaint / assistance processing** — ~~`/admin/appointments`,
   `/admin/complaints`, and `/admin/assistance` model the remaining three ticket
   queues end-to-end~~ **BUILT 2026-07-17 — see the ticketing-flows changelog entry
   above.** Same pattern as (5): Server Actions, service-role client, walk-in
   encoding, real reviewer identity. **Still outstanding: emailing residents their
   ticket number or a status update** — §2D's Plan 1 (2026-07-30) built the send pipeline
   these four flows would use but wired only the contact-inquiry form (see item A above);
   these ticket receipts/status notices remain scoped to §2D's Plan 2, and today every flow
   still ends in an on-screen receipt only.
```

with:

```
6. **Appointment / complaint / assistance processing** — ~~`/admin/appointments`,
   `/admin/complaints`, and `/admin/assistance` model the remaining three ticket
   queues end-to-end~~ **BUILT 2026-07-17 — see the ticketing-flows changelog entry
   above.** Same pattern as (5): Server Actions, service-role client, walk-in
   encoding, real reviewer identity. ~~**Still outstanding: emailing residents their
   ticket number or a status update**~~ **BUILT 2026-07-30** (§2D Plan 2,
   `docs/superpowers/plans/2026-07-30-resend-email-remaining-triggers.md`). All four flows
   — applications, appointments, complaints, assistance, online and walk-in alike — now
   email a submission receipt when the resident gave an email address, and the 8
   "final outcome" status transitions (approved/rejected, confirmed/declined,
   resolved/dismissed, granted/declined) each email a matching notice.
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/BACKEND_HANDOFF.md
git commit -m "docs: close out Plan 2 of the Resend rollout in CLAUDE.md and BACKEND_HANDOFF.md"
```

---

## Self-review notes (for the plan author, not a task)

- **Spec coverage:** every trigger point in the design's "Trigger points — contact &
  feedback" (feedback half), "submission receipts", and "status-change" sections has a
  task. `staffEmailsFor` was already built and tested in Plan 1's final review — confirmed
  via `tests/unit/notifications.test.ts` before writing this plan, not assumed.
- **Skipped on purpose, matching the design:** `releaseApplication`, `completeAppointment`,
  and the `under-review` branches of `reviewComplaint`/`reviewAssistance` send no email.
  Delivery monitoring (`email_log` + webhook) is explicitly Plan 3, not this plan.
- **Type consistency:** every template's prop names match exactly what each action passes
  (`firstName`, `ticketNo`, `serviceTitle`, `categoryLabel`, `remarks`, `confirmedPeriod` as
  `"am" | "pm"` throughout — never importing the app's own `AppointmentPeriod` type into
  `src/emails/`, keeping templates decoupled from the DB type layer per the design's "no DB
  access inside a template" rule).
