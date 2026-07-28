-- Durable rate limiting: replaces the in-memory limiter in src/lib/rate-limit.ts.
--
-- The previous implementation (a plain in-memory Map) resets on every
-- redeploy and does not share state across serverless instances — flagged in
-- its own top-of-file comment since Plan 3. checkRateLimit() now counts rows
-- in this table instead of a Map, so the limit holds regardless of which
-- instance serves a given request or how recently the process restarted.
--
-- RLS: enabled with NO policies, exactly like every other table — only the
-- service-role client (inside checkRateLimit itself) ever touches this.
--
-- No cleanup job: checkRateLimit() opportunistically deletes rows older than
-- 24 hours on a small random fraction of calls, mirroring the "opportunistic
-- sweep" the old in-memory Map already did once it grew past 5000 keys. This
-- avoids adding a pg_cron dependency for a table that self-limits in size.

create table public.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  hit_at timestamptz not null default now()
);

-- Every checkRateLimit() call filters by key and a recent hit_at window —
-- this composite index serves both the count and the cleanup delete.
create index rate_limit_hits_key_hit_at_idx
  on public.rate_limit_hits (key, hit_at desc);

alter table public.rate_limit_hits enable row level security;
