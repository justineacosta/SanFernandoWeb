# supabase/migrations/

Numbered, one-way migrations (`0001`–`0023` as of 2026-07-23), applied manually by the repo
owner against live Supabase environments — see `CLAUDE.md` and `docs/BACKEND_HANDOFF.md` for
the current per-environment status.

**`../baseline/0000_baseline_2026-07-23.sql` is a squash of this directory**, for standing up a
brand-new environment in one shot instead of replaying every numbered file. It is a snapshot,
not a live view — it will drift from this directory the moment a new migration lands.

**If you are adding `0024` (or later):** fold the same change into the baseline file too, in
the same commit. Add the new DDL in its final form under the right `§` section (don't append a
new "run 0024 after" step), extend the `SECTION MAP` / squash range in the header comment if the
change warrants it, and leave this directory's numbered migration exactly as you'd otherwise
write it — the baseline is additive documentation of the same schema, not a replacement for the
numbered file. If the baseline is not updated in the same change, a fresh environment built from
it will silently miss `0024`.
