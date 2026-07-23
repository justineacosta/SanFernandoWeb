-- Audit Log v2 (portal overhaul sub-project 3; design doc
-- docs/superpowers/specs/2026-07-22-audit-logs-v2-design.md).
--
-- Turns the append-only activity feed from migration 0001 into a filterable,
-- genuinely immutable audit log:
--   1. a controlled action_type enum (the Action Type dropdown needs values,
--      not the free-text English in `action`),
--   2. entity_label — the human name captured at WRITE time, because joining at
--      read time breaks exactly when a record is deleted, which is the case the
--      audit trail exists for,
--   3. real immutability (REVOKE + triggers), and
--   4. RLS alignment: the permissive read policy is dropped so this table
--      matches every other one — enabled with no policies, reads through the
--      service-role client behind an explicit code check.
--
-- ORDER MATTERS: the backfill runs BEFORE the immutability triggers are
-- created. Once those exist, no migration can correct an audit row without
-- deliberately disabling them.

-- ── 1. Action type enum ─────────────────────────────────────────────────────
create type public.audit_action as enum (
  'create',
  'update',
  'delete',
  'archive',
  'restore',
  'publish',
  'unpublish',
  'save_draft',
  'approve',
  'reject',
  'login',
  'logout',
  'file_upload',
  'file_delete',
  'role_change',
  'password_reset',
  'reorder'
);

-- ── 2. New columns ──────────────────────────────────────────────────────────
-- Added nullable so the backfill below can populate action_type before the
-- NOT NULL constraint is applied.
alter table public.audit_log
  add column action_type public.audit_action,
  add column entity_label text;

comment on column public.audit_log.action_type is
  'Controlled action class, drives the Audit Logs dropdown filter. Never null.';
comment on column public.audit_log.entity_label is
  'Human name of the target captured at write time (e.g. "Maria Santos"), so the '
  'trail still reads correctly after the target row is deleted.';
comment on column public.audit_log.detail is
  'Free-text extra context — staff remarks on ticket decisions. NOT the entity '
  'name; that is entity_label.';

-- ── 3. Backfill action_type from the existing free-text `action` ────────────
-- Classification mirrors the mapping table in the design doc §3.2. Anything
-- unrecognised falls to 'update', the honest default for an unclassified edit.
update public.audit_log set action_type = (
  case
    when action like 'created %'
      or action like 'added %'
      or action like 'encoded walk-in%'        then 'create'
    when action like 'deleted %'               then 'delete'
    when action like 'archived %'
      or action like 'retired %'               then 'archive'
    when action like 'restored %'              then 'restore'
    when action like 'published %'             then 'publish'
    when action like 'returned % to draft'     then 'save_draft'
    when action like 'reordered %'             then 'reorder'
    when action like 'uploaded %'              then 'file_upload'
    when action like 'removed %photo'          then 'file_delete'
    when action like 'approved %'
      or action like 'confirmed %'
      or action like 'granted %'
      or action like 'resolved %'              then 'approve'
    when action like 'rejected %'
      or action like 'declined %'
      or action like 'dismissed %'             then 'reject'
    when action = 'changed own password'       then 'password_reset'
    else 'update'
  end
)::public.audit_action;

alter table public.audit_log alter column action_type set not null;

-- Deliberately NO default: recordActivity() is the only writer and must always
-- classify. A default would let an unclassified write pass silently.

-- ── 4. Backfill entity_label from `detail` where it holds a name ────────────
-- Most call sites passed the entity's title/label/number in `detail`; the
-- ticket flows passed staff remarks there instead. Remarks are long and
-- sentence-like, titles are short — but that heuristic is not safe enough to
-- move data on, so only the unambiguous case is backfilled: rows whose
-- entity_type is a content type (never a ticket) get their detail copied.
update public.audit_log
   set entity_label = detail
 where detail is not null
   and entity_type not in ('application', 'appointment', 'complaint', 'assistance');

-- Ticket rows already carry a human-readable identifier in entity_id
-- (e.g. 'APP-2026-00001'), so their Target Entity column renders from that.

-- ── 5. Indexes for the dropdown filter and actor filter ─────────────────────
create index audit_log_action_type_idx on public.audit_log (action_type, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

-- ── 6. RLS alignment ────────────────────────────────────────────────────────
-- Migration 0001 let ANY signed-in staff member read the whole log via the
-- anon key. The log is SuperAdmin-only now, and every other table in this
-- schema is RLS-enabled with zero policies, gated by an explicit code check on
-- the service-role client. Drop the policy so the code check is the only gate.
drop policy if exists "audit log readable by signed-in staff" on public.audit_log;

-- ── 7. Drop the actor_id FK before making the table immutable ───────────────
-- Migration 0001 declared `actor_id uuid references auth.users (id) on delete
-- set null`. That ON DELETE SET NULL is an UPDATE against audit_log — which
-- the immutability trigger below would reject, making it impossible to delete
-- any staff member who had ever done anything (deleteTeamUser would fail with
-- a raised exception rather than a handled error).
--
-- The FK is dropped rather than the trigger being taught to allow it: an
-- append-only historical record should not be mutable by another table's
-- lifecycle at all. `actor_name` is already denormalised onto every row for
-- exactly this reason, so the trail still reads correctly after an account is
-- removed — which is the property master spec §4 wants when it says the audit
-- log must never point at a ghost.
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;

comment on column public.audit_log.actor_id is
  'auth.users id at the time of the action. Deliberately NOT a foreign key — '
  'the log outlives the account, and actor_name preserves the readable name.';

-- ── 8. Immutability ─────────────────────────────────────────────────────────
-- REVOKE stops the roles the application actually uses; the triggers fire even
-- for the table owner, which is what makes this real rather than advisory.
-- Escape hatch for a deliberate future correction:
--   alter table public.audit_log disable trigger audit_log_no_update;
revoke update, delete on public.audit_log from anon, authenticated, service_role;

create or replace function public.reject_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op
    using hint = 'Audit records are immutable by design.';
end $$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.reject_audit_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.reject_audit_mutation();
