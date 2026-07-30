# Resend Email — Foundation (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the shared Resend mailer + React Email template system, and wire the first real trigger (contact inquiries) end to end — proving the whole pipeline before Plans 2 and 3 build on it.

**Architecture:** A plain (non-`"use server"`) helper library, `src/lib/email.ts`, wraps the `resend` SDK behind a `sendEmail()` function that never throws (fail-open, matching this codebase's rate-limiter pattern). Templates are `@react-email/components` JSX under `src/emails/`, composed inside one shared `<EmailLayout>`. `submitInquiry` becomes the first caller: it sends a resident acknowledgment and a staff notification, using a new `staffEmailsFor()` helper in `src/lib/notifications.ts` that resolves recipients from the same permission model the notification-badge system already uses.

**Tech Stack:** Next.js 16 Server Actions, `resend` SDK, `@react-email/components` + `@react-email/render`, Supabase (service-role client), Vitest.

## Global Constraints

- `sendEmail()` must never throw to its caller, in **any** environment — this
  is the fail-open decision from the design spec. A misconfigured
  `RESEND_API_KEY` or a Resend outage must never turn into a failed resident
  submission.
- Every call site `await`s `sendEmail()` / `staffEmailsFor()` — never
  fire-and-forget (`void ...`). The DB write that triggers an email is always
  committed first; there is nothing to roll back on an email failure.
- Missing `RESEND_API_KEY` or `RESEND_FROM_EMAIL`: in development, skip
  sending with a **one-time** `console.warn`. In production, skip sending but
  log via `console.error` on **every** call (loud in logs, never a thrown
  exception).
- Templates live under `src/emails/`, each composed inside the one shared
  `<EmailLayout>` — no per-template reimplementation of the header/footer.
- No new preview tooling (no Storybook, no `@react-email/preview` dev
  server). Verification is via Vitest (`render()` producing an HTML string)
  and the manual `verify` skill.
- **This is Plan 1 of 3 (Foundation).** In scope: `src/lib/email.ts`,
  `<EmailLayout>`, and only the contact-inquiry trigger (acknowledgment +
  staff notify). Feedback, all four ticketing flows' receipts/status-change
  notices, and the `email_log`/webhook monitoring system are Plans 2 and 3 —
  do not build them here.
- Full design: `docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`.
- This plan is implemented in a dedicated git worktree branched from
  `development` (per `superpowers:using-git-worktrees`), not committed
  directly to `main` or `development`.

---

### Task 1: `sendEmail()` foundation

**Files:**
- Modify: `package.json` (add `resend`, `@react-email/components` as dependencies; `@react-email/render` as a devDependency)
- Modify: `.env.example`
- Create: `src/lib/email.ts`
- Test: `tests/unit/email.test.ts`

**Interfaces:**
- Produces: `sendEmail(input: SendEmailInput): Promise<SendEmailResult>` where
  `SendEmailInput = { to: string | string[]; replyTo?: string | string[]; subject: string; template: ReactElement }`
  and `SendEmailResult = { ok: boolean; id?: string }`. Every later task in
  this plan (and every trigger in Plans 2/3) calls this exact signature.

- [ ] **Step 1: Install the new dependencies**

```bash
npm install resend @react-email/components
npm install -D @react-email/render
```

- [ ] **Step 2: Add env vars to `.env.example`**

Add this block after the existing Turnstile section:

```
# Resend — https://resend.com/api-keys. Used for transactional email
# (ticket receipts, status updates, contact-form acknowledgments).
# RESEND_FROM_EMAIL must be a verified sender/domain in your Resend account,
# e.g. "Barangay San Fernando <notifications@yourdomain>". Until a custom
# domain is verified, use the onboarding sender Resend provides.
# In development, an unset RESEND_API_KEY skips sending with a console
# warning. In production, sendEmail() still never throws — a missing key
# just means every send is skipped and logged via console.error.
RESEND_API_KEY=YOUR-RESEND-API-KEY
RESEND_FROM_EMAIL="Barangay San Fernando <notifications@yourdomain>"

# Absolute base URL of the deployed site. Email clients cannot resolve
# relative paths, so every image/link inside an email template is built as
# `${NEXT_PUBLIC_SITE_URL}${path}`. Baked into the client bundle at build
# time, same as NEXT_PUBLIC_TURNSTILE_SITE_KEY.
NEXT_PUBLIC_SITE_URL=https://yourdomain
```

- [ ] **Step 3: Write the failing tests**

Create `tests/unit/email.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above regular `const` declarations, so the
// mock function itself must be created inside vi.hoisted() — referencing a
// plain top-level `const sendMock = vi.fn()` here would throw a
// temporal-dead-zone error at module load.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe("sendEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("skips sending in development when the API key is unset, warning once", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not throw in production when the API key is unset, logging an error every call", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email");

    await sendEmail({ to: "resident@example.com", subject: "Hi", template: {} as never });
    const result = await sendEmail({ to: "resident@example.com", subject: "Hi", template: {} as never });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalledTimes(2);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends through Resend and returns the id when configured", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: true, id: "email_123" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "resident@example.com",
        subject: "Hi",
        from: "Barangay San Fernando <test@example.com>",
      }),
    );
  });

  it("fails open when Resend reports an error", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockResolvedValue({ data: null, error: { message: "invalid recipient" } });
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({ to: "bad", subject: "Hi", template: {} as never });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalled();
  });

  it("fails open when the send call itself throws", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Barangay San Fernando <test@example.com>";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await import("@/lib/email");

    const result = await sendEmail({
      to: "resident@example.com",
      subject: "Hi",
      template: {} as never,
    });

    expect(result).toEqual({ ok: false });
    expect(error).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:unit -- email.test.ts`
Expected: FAIL — `Cannot find module '@/lib/email'` (the file doesn't exist yet).

- [ ] **Step 5: Implement `src/lib/email.ts`**

```ts
import { Resend } from "resend";
import type { ReactElement } from "react";

export interface SendEmailInput {
  to: string | string[];
  replyTo?: string | string[];
  subject: string;
  template: ReactElement;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
}

let warnedDevSkip = false;

/**
 * Sends one transactional email through Resend. Never throws — a missing
 * API key, a Resend-reported error, or the send call itself throwing all
 * fail open and return `{ ok: false }`, because every caller in this app
 * fires this after its own DB write already committed. An email failure
 * must never turn into a failed resident submission.
 *
 * Missing RESEND_API_KEY/RESEND_FROM_EMAIL: development skips with a
 * one-time console.warn (no Resend account required for `npm run dev`).
 * Production also skips (never throws) but logs via console.error on every
 * call, so a misconfigured deploy is loud in the logs without blocking
 * anything it's layered on top of.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error("sendEmail: RESEND_API_KEY or RESEND_FROM_EMAIL is not set; email not sent.");
    } else if (!warnedDevSkip) {
      console.warn(
        "sendEmail: RESEND_API_KEY or RESEND_FROM_EMAIL is not set; skipping email send in development.",
      );
      warnedDevSkip = true;
    }
    return { ok: false };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      react: input.template,
    });
    if (error) {
      console.error("sendEmail: Resend API returned an error:", error.message);
      return { ok: false };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("sendEmail: unexpected failure:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:unit -- email.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/lib/email.ts tests/unit/email.test.ts
git commit -m "feat: add fail-open Resend mailer (sendEmail)"
```

---

### Task 2: Shared `<EmailLayout>`

**Files:**
- Create: `src/emails/site-url.ts`
- Create: `src/emails/EmailLayout.tsx`
- Test: `tests/unit/email-layout.test.ts`

**Interfaces:**
- Consumes: `SITE` from `@/constants/site` (`SITE.name`, `SITE.address`, `SITE.phone`, `SITE.email`).
- Produces: `EMAIL_SITE_URL: string` from `@/emails/site-url`, reused by every
  template that needs an absolute link. `EmailLayout({ previewText: string; children: ReactNode })`
  from `@/emails/EmailLayout`, consumed by every template in Task 3 and every
  later plan's templates.

- [ ] **Step 1: Create the shared site-URL constant**

`src/emails/site-url.ts`:

```ts
/**
 * Absolute base URL for links and images inside email templates. Email
 * clients cannot resolve relative paths, unlike the app's own pages.
 */
export const EMAIL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/email-layout.test.ts`:

```ts
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { EmailLayout } from "@/emails/EmailLayout";

describe("EmailLayout", () => {
  it("wraps its children and renders the barangay name, address, and phone", async () => {
    const html = await render(
      createElement(
        EmailLayout,
        { previewText: "Test preview" },
        createElement("p", null, "Hello resident"),
      ),
    );

    expect(html).toContain("Barangay San Fernando");
    expect(html).toContain("Hello resident");
    expect(html).toContain("(077) 600 1082");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:unit -- email-layout.test.ts`
Expected: FAIL — `Cannot find module '@/emails/EmailLayout'`.

- [ ] **Step 4: Implement `src/emails/EmailLayout.tsx`**

```tsx
import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { SITE } from "@/constants/site";
import { EMAIL_SITE_URL } from "./site-url";

interface EmailLayoutProps {
  previewText: string;
  children: ReactNode;
}

/**
 * Shared header/footer for every transactional email — the email equivalent
 * of AdminShell being the one layout for admin pages. Inline styles only:
 * email clients don't reliably load external stylesheets.
 */
export function EmailLayout({ previewText, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f5f1ea", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            maxWidth: 480,
            margin: "0 auto",
            overflow: "hidden",
          }}
        >
          <Section style={{ backgroundColor: "#b45309", padding: "20px 24px", textAlign: "center" }}>
            <Img
              src={`${EMAIL_SITE_URL}/icon.png`}
              width="48"
              height="48"
              alt={SITE.name}
              style={{ margin: "0 auto 8px" }}
            />
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, margin: 0 }}>{SITE.name}</Text>
          </Section>
          <Section style={{ padding: "24px" }}>{children}</Section>
          <Hr style={{ borderColor: "#e5e0d8", margin: 0 }} />
          <Section style={{ padding: "16px 24px" }}>
            <Text style={{ color: "#6b6255", fontSize: 12, margin: 0 }}>{SITE.address}</Text>
            <Text style={{ color: "#6b6255", fontSize: 12, margin: 0 }}>
              {SITE.phone} &middot; {SITE.email}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:unit -- email-layout.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/emails/site-url.ts src/emails/EmailLayout.tsx tests/unit/email-layout.test.ts
git commit -m "feat: add shared EmailLayout for transactional emails"
```

---

### Task 3: Inquiry email templates

**Files:**
- Create: `src/emails/InquiryAcknowledgedEmail.tsx`
- Create: `src/emails/InquiryStaffNotifyEmail.tsx`
- Test: `tests/unit/inquiry-emails.test.ts`

**Interfaces:**
- Consumes: `EmailLayout` from `@/emails/EmailLayout` (Task 2), `EMAIL_SITE_URL` from `@/emails/site-url` (Task 2).
- Produces: `InquiryAcknowledgedEmail({ firstName: string; subject: string }): ReactElement`
  and `InquiryStaffNotifyEmail({ fullName: string; subject: string; message: string; inquiryId: string }): ReactElement`,
  both consumed by Task 5's `submitInquiry`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/inquiry-emails.test.ts`:

```ts
import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { InquiryAcknowledgedEmail } from "@/emails/InquiryAcknowledgedEmail";
import { InquiryStaffNotifyEmail } from "@/emails/InquiryStaffNotifyEmail";

describe("InquiryAcknowledgedEmail", () => {
  it("greets the resident by first name and includes their subject", async () => {
    const html = await render(
      createElement(InquiryAcknowledgedEmail, { firstName: "Maria", subject: "Barangay Clearance" }),
    );

    expect(html).toContain("Hi Maria");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("24-48 business hours");
  });
});

describe("InquiryStaffNotifyEmail", () => {
  it("includes the sender, subject, message, and a link to the specific inquiry", async () => {
    const html = await render(
      createElement(InquiryStaffNotifyEmail, {
        fullName: "Maria Santos",
        subject: "Barangay Clearance",
        message: "How do I request one?",
        inquiryId: "abc-123",
      }),
    );

    expect(html).toContain("Maria Santos");
    expect(html).toContain("Barangay Clearance");
    expect(html).toContain("How do I request one?");
    expect(html).toContain("/admin/inquiries?review=abc-123");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- inquiry-emails.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement `src/emails/InquiryAcknowledgedEmail.tsx`**

```tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";

export interface InquiryAcknowledgedEmailProps {
  firstName: string;
  subject: string;
}

export function InquiryAcknowledgedEmail({ firstName, subject }: InquiryAcknowledgedEmailProps) {
  return (
    <EmailLayout previewText="We received your message">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {firstName},</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 12px" }}>
        We received your message about &ldquo;{subject}&rdquo;. Our office typically responds
        within 24-48 business hours.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        This is an automated confirmation — no need to reply unless you have more details to add.
      </Text>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Implement `src/emails/InquiryStaffNotifyEmail.tsx`**

```tsx
import { Button, Text } from "@react-email/components";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface InquiryStaffNotifyEmailProps {
  fullName: string;
  subject: string;
  message: string;
  inquiryId: string;
}

export function InquiryStaffNotifyEmail({ fullName, subject, message, inquiryId }: InquiryStaffNotifyEmailProps) {
  return (
    <EmailLayout previewText={`New inquiry from ${fullName}`}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>New inquiry from {fullName}</Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Subject:</strong> {subject}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</Text>
      <Button
        href={`${EMAIL_SITE_URL}/admin/inquiries?review=${inquiryId}`}
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- inquiry-emails.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/emails/InquiryAcknowledgedEmail.tsx src/emails/InquiryStaffNotifyEmail.tsx tests/unit/inquiry-emails.test.ts
git commit -m "feat: add inquiry acknowledgment and staff-notify email templates"
```

---

### Task 4: `staffEmailsFor()` staff recipient resolution

**Files:**
- Modify: `src/lib/notifications.ts`
- Test: `tests/unit/notifications.test.ts` (add to the existing file)

**Interfaces:**
- Consumes: `Permission` from `@/types`, `createSupabaseAdminClient` from `@/lib/supabase/admin`.
- Produces: `staffQualifies(profile: { isSuperAdmin: boolean; permissions: Permission[] }, permission: Permission): boolean`
  (pure, unit-tested directly) and `staffEmailsFor(permission: Permission): Promise<string[]>`
  (the DB-touching wrapper), consumed by Task 5's `submitInquiry` and by
  every staff-notify trigger added in Plan 2.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/notifications.test.ts` (open the file first to match its existing import style, then append):

```ts
describe("staffQualifies", () => {
  it("qualifies a SuperAdmin regardless of their permissions list", () => {
    expect(staffQualifies({ isSuperAdmin: true, permissions: [] }, "handle-inquiries")).toBe(true);
  });

  it("qualifies a staff member who holds the exact permission", () => {
    expect(
      staffQualifies({ isSuperAdmin: false, permissions: ["handle-inquiries"] }, "handle-inquiries"),
    ).toBe(true);
  });

  it("does not qualify a staff member missing the permission", () => {
    expect(
      staffQualifies({ isSuperAdmin: false, permissions: ["process-applications"] }, "handle-inquiries"),
    ).toBe(false);
  });
});
```

Add `staffQualifies` to the existing `import { ... } from "@/lib/notifications"` line at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit -- notifications.test.ts`
Expected: FAIL — `staffQualifies` is not exported.

- [ ] **Step 3: Implement in `src/lib/notifications.ts`**

Add near the bottom of the file (after `formatRelativeTime`), and add
`import { createSupabaseAdminClient } from "@/lib/supabase/admin";` to the
top of the file alongside the existing imports:

```ts
/**
 * Whether a staff member qualifies for a permission-gated email. SuperAdmins
 * always qualify, matching every other permission check in this codebase
 * (requirePermission, checkPermission, permittedQueues above).
 */
export function staffQualifies(
  profile: { isSuperAdmin: boolean; permissions: Permission[] },
  permission: Permission,
): boolean {
  return profile.isSuperAdmin || profile.permissions.includes(permission);
}

/**
 * Emails of every active, non-archived staff member who qualifies for
 * `permission` — used by trigger points that email staff on arrival
 * (inquiries, and later feedback/ticketing). Returns an empty array, never
 * throws, if nobody currently holds the permission or the query fails; the
 * caller treats that as "nothing to send," the same "nothing to do" shape
 * as a resident who left their email blank.
 */
export async function staffEmailsFor(permission: Permission): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("email, is_superadmin, permissions")
    .eq("is_active", true)
    .eq("is_archived", false);
  if (error || !data) {
    console.error("staffEmailsFor failed:", error?.message);
    return [];
  }
  return data
    .filter((row) =>
      staffQualifies(
        { isSuperAdmin: row.is_superadmin, permissions: row.permissions as Permission[] },
        permission,
      ),
    )
    .map((row) => row.email);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit -- notifications.test.ts`
Expected: PASS (all existing tests in the file still pass, plus the 3 new ones)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications.ts tests/unit/notifications.test.ts
git commit -m "feat: add staffEmailsFor for permission-gated staff notifications"
```

---

### Task 5: Wire into `submitInquiry`

**Files:**
- Modify: `src/features/contact/actions.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 1), `InquiryAcknowledgedEmail` / `InquiryStaffNotifyEmail` (Task 3), `staffEmailsFor` (Task 4).
- Produces: no new exports — `submitInquiry`'s signature and `SubmitInquiryResult` are unchanged.

This task has no new automated test: `submitInquiry` already has no
Playwright coverage (`tests/e2e/public/` has no `contact.spec.ts`), and per
the design spec there is deliberately no new e2e suite for email content —
verification is manual, in Task 6.

- [ ] **Step 1: Read the current file to confirm line numbers before editing**

Run: `cat -n src/features/contact/actions.ts` (or open it in your editor) — confirm the `.insert({...})` block and its trailing `if (error) { ... }` check match what's shown below before editing, since a concurrent change would shift line numbers.

- [ ] **Step 2: Add the new imports**

At the top of `src/features/contact/actions.ts`, after the existing
`import { inquirySchema } from "./schema";` line, add:

```ts
import { sendEmail } from "@/lib/email";
import { staffEmailsFor } from "@/lib/notifications";
import { InquiryAcknowledgedEmail } from "@/emails/InquiryAcknowledgedEmail";
import { InquiryStaffNotifyEmail } from "@/emails/InquiryStaffNotifyEmail";
```

- [ ] **Step 3: Capture the inserted row's id and send both emails**

Replace this block:

```ts
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("inquiries").insert({
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });
  if (error) {
    console.error("submitInquiry failed:", error.message);
    return { error: "We could not send your message. Please try again." };
  }

  return { error: null };
```

with:

```ts
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("inquiries")
    .insert({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      subject: parsed.data.subject,
      message: parsed.data.message,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("submitInquiry failed:", error?.message);
    return { error: "We could not send your message. Please try again." };
  }

  // Best-effort notifications: the inquiry row is already saved above, so
  // sendEmail()/staffEmailsFor() failing must never surface as an error to
  // the resident — both fail open by construction (see src/lib/email.ts).
  await sendEmail({
    to: parsed.data.email,
    subject: "We received your message — Barangay San Fernando",
    template: InquiryAcknowledgedEmail({
      firstName: parsed.data.firstName,
      subject: parsed.data.subject,
    }),
  });

  const staffEmails = await staffEmailsFor("handle-inquiries");
  if (staffEmails.length > 0) {
    await sendEmail({
      to: staffEmails,
      subject: `New inquiry: ${parsed.data.subject}`,
      template: InquiryStaffNotifyEmail({
        fullName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        subject: parsed.data.subject,
        message: parsed.data.message,
        inquiryId: data.id,
      }),
    });
  }

  return { error: null };
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS (no regressions in any existing test)

- [ ] **Step 6: Commit**

```bash
git add src/features/contact/actions.ts
git commit -m "feat: send acknowledgment and staff-notify emails on inquiry submission"
```

---

### Task 6: Update CLAUDE.md and manually verify end to end

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** None — this is documentation plus manual verification, no code.

- [ ] **Step 1: Add a CLAUDE.md entry**

Per this repo's standing rule ("every session that changes code updates
CLAUDE.md in the same session"), add this new bullet to the Architecture
section of `CLAUDE.md`, placed after the existing media-bucket-split bullet
(before the "Autosave is a local recovery copy" bullet):

```markdown
- **Transactional email (Resend), Plan 1 of 3: foundation, 2026-07-30**
  (`docs/superpowers/specs/2026-07-30-resend-email-integration-design.md`).
  Closes `docs/BACKEND_HANDOFF.md`'s previously-undesigned §2D. `src/lib/email.ts`'s
  `sendEmail()` wraps the `resend` SDK and is **fail-open by construction, in
  every environment** — it never throws to its caller, matching the rate
  limiter's fail-open reasoning: every trigger fires after its own DB write
  already committed, so an email failure must never turn into a failed
  resident submission. Missing `RESEND_API_KEY`/`RESEND_FROM_EMAIL` skips
  sending either way; development warns once via `console.warn`, production
  logs via `console.error` on every call rather than throwing (a deliberate
  divergence from Turnstile's dev-skip/prod-throw asymmetry — Turnstile IS
  the anti-bot layer, so failing open there would defeat its purpose; email
  is a best-effort layer with nothing depending on it succeeding). Templates
  are `@react-email/components` JSX under `src/emails/`, every one composed
  inside the shared `<EmailLayout>` (seal, amber header, footer address/phone)
  — the email equivalent of `AdminShell`. `EMAIL_SITE_URL`
  (`src/emails/site-url.ts`, from `NEXT_PUBLIC_SITE_URL`) exists because email
  clients can't resolve relative paths the way the app's own pages can.
  `staffEmailsFor()` (`src/lib/notifications.ts`) resolves staff recipients
  by reusing the exact `permission` each `NOTIFICATION_QUEUES` entry already
  declares — no new permission model. **`submitInquiry` is the first and,
  as of this plan, only wired trigger**: an acknowledgment to the resident
  plus a staff notification to every `handle-inquiries` holder. Plan 2
  (feedback's staff alert, all four ticketing flows' submission receipts and
  status-change notices) and Plan 3 (delivery monitoring via a dedicated
  `email_log` table + Resend webhook — deliberately not `audit_log`, which
  is built for human staff actions, not automated system events) are not
  yet built.
```

- [ ] **Step 2: Commit the CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: document the Resend email foundation in CLAUDE.md"
```

- [ ] **Step 3: Manual end-to-end verification**

Use the `verify` skill (`.claude/skills/verify/SKILL.md`) to build and run
the app, then:
1. Set `RESEND_API_KEY` unset (or leave `.env.local` without it) — confirm
   `npm run dev` starts cleanly and submitting the `/contact` form still
   succeeds, with a `sendEmail: ... skipping email send in development`
   warning appearing exactly once in the server console no matter how many
   times the form is submitted.
2. If a real `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are available in
   `.env.local`, submit `/contact` again and confirm two emails actually
   arrive: the acknowledgment (to the email address used in the form) and
   the staff notification (to every account holding `handle-inquiries` —
   check the Team/Users list at `/admin/users` if unsure who that is).
3. Open the staff notification email and confirm its "View in admin portal"
   link resolves to the correct `/admin/inquiries?review=<id>` record.
4. Confirm the barangay seal image in the email header actually loads (not
   a broken image icon) — this is the one part of the design that depends
   on `/icon.png` being served at that exact path in this Next.js version;
   if it 404s, note it as a follow-up rather than silently shipping a
   broken image.

Report the outcome of steps 1-4 before considering this plan complete.
