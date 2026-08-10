# Audit log

`audit_log` (migration `0014`), written only through `recordActivity`
(`src/lib/audit.ts`). Read back through `search_audit_log` (`0015`).

## Guarantees

- **Append-only at the database level** — `0014` revokes UPDATE/DELETE and adds rejecting
  triggers. `recordActivity` is the only way rows ever enter the table.
- **Fire-and-forget by design.** An audit failure must never roll back the action it
  records: `recordActivity` catches, `console.error`s and returns. Never `await` it in a way
  that can fail the caller, and never make a decision conditional on it succeeding.

## `AuditInput` fields

An options object rather than positional arguments — with six fields, a positional call is
unreadable and easy to mis-order.

- `type` — controlled `AuditActionType`, drives the Action Type dropdown filter.
- `action` — human sentence kept alongside the type, e.g. `"archived announcement"`.
- `entityType` — what kind of thing was acted on, e.g. `"official"`, `"news article"`.
- `entityId` — row id, **or the ticket number** for ticket flows.
- `entityLabel` — the target's human name, **captured NOW**. Resolving it at read time would
  break precisely when the row is deleted — the case the trail matters for.
- `detail` — extra context (staff remarks on a decision). **Never the entity name.**

`auditTypeForStatus(status)` maps a `draft → in-review → published → archived` transition to
its `AuditActionType` (`publish` / `archive` / `save_draft` / `update`), shared by the four
managers whose status actions record `${nextStatus} <entity>` so the mapping lives in one
place instead of four.

## What is logged, and what deliberately is not

- Every content status transition, restore (`restore`) and permanent delete.
- Both idle sign-out paths — open tab (`signOutIdle`) and closed tab (the Proxy idle-gate
  branch) — file the identical row: `type: "logout"`, `detail: "signed out for
  inactivity"`. See `.claude/authentication.md` for how the closed-tab branch resolves an
  actor. A stale background tab can file a second, harmless row; **not deduplicated**, since
  two true rows cost less than the query needed to suppress one.
- **A rejected sign-in is deliberately NOT logged** — that row would be unbounded and
  attacker-triggerable at will.
- **The public forgot-password request IS logged**, reusing the existing `"password_reset"`
  type, with `detail: "requested from the public forgot-password form"`. It is filed against
  a *real* account by an anonymous caller, and **the `detail` is what stops a reader
  mistaking the row for the holder's own action**. This does not contradict the rejected
  sign-in rule: this row is capped by the email-keyed rate-limit window and holds no
  attacker-controlled free text, so it can only prove volume.

## When adding a new audited action

1. Reuse an existing `AuditActionType` if one fits — the dropdown filter is a controlled
   list, and a new type widens it for everyone.
2. Capture `entityLabel` at write time.
3. Keep attacker-controlled free text out of `detail` on anything an anonymous caller can
   trigger.
4. Decide explicitly whether a *failed* attempt should be logged, using the two rules above:
   bounded and non-forgeable → log it; unbounded and attacker-triggerable → don't.
