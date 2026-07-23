/**
 * Pure helpers behind the admin drawers' recovery copies (sub-project 8).
 *
 * Deliberately free of `window`: every function here takes what it needs as an
 * argument, so the key format, the expiry rule and the size cap can be pinned
 * by unit tests without a DOM. `useFormDraft` owns all the storage access.
 */

/** Bumping the version abandons old snapshots rather than migrating them. */
export const DRAFT_KEY_PREFIX = "sf-draft:v1:";

/** A snapshot older than this is an artefact, not a rescue. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Past this, the write is skipped. `localStorage` gives an origin roughly 5 MB;
 * a body long enough to hit this is far past anything the news editor expects,
 * and silently filling the quota would break autosave for every other drawer.
 */
export const DRAFT_MAX_BYTES = 256 * 1024;

/**
 * The draft-capable forms: the seven of umbrella §3.7, plus the site-content
 * editors added by sub-project 9. Site content has no draft/published workflow
 * of its own, but its drawers close on Esc like every other, so the local
 * recovery copy is worth exactly as much there.
 */
export type DraftScope =
  | "news"
  | "announcement"
  | "event"
  | "official"
  | "legislative-v2"
  | "transparency-document"
  | "transparency-project"
  | "site-item"
  | "site-block";

export interface DraftSnapshot<T> {
  savedAt: number;
  values: T;
}

/**
 * Keys carry the user id because a barangay hall workstation is plausibly
 * shared: without it, the next person to open the drawer would be offered the
 * previous person's unsaved text.
 */
export function draftKey(userId: string, scope: DraftScope, recordId: string | null): string {
  return `${DRAFT_KEY_PREFIX}${userId}:${scope}:${recordId ?? "new"}`;
}

export function isDraftKey(key: string): boolean {
  return key.startsWith(DRAFT_KEY_PREFIX);
}

/**
 * Serialise a snapshot, or return null when it would exceed the cap.
 *
 * Null means "do not write" — never "write something truncated". A half a
 * snapshot restores as corrupted text, which is worse than no snapshot.
 */
export function encodeSnapshot<T>(values: T, savedAt: number): string | null {
  let raw: string;
  try {
    raw = JSON.stringify({ savedAt, values });
  } catch {
    return null;
  }
  return raw.length > DRAFT_MAX_BYTES ? null : raw;
}

/**
 * Parse a stored snapshot, rejecting anything unusable: absent, malformed,
 * the wrong shape, or expired. Every rejection is the same answer — there is
 * no recovery copy — because a caller can do nothing else with the distinction.
 */
export function decodeSnapshot<T>(raw: string | null, now: number): DraftSnapshot<T> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as { savedAt?: unknown; values?: unknown };
  if (typeof candidate.savedAt !== "number" || !Number.isFinite(candidate.savedAt)) return null;
  if (typeof candidate.values !== "object" || candidate.values === null) return null;
  // A savedAt in the future means a clock change, not a valid snapshot.
  if (candidate.savedAt > now) return null;
  if (now - candidate.savedAt > DRAFT_TTL_MS) return null;
  return { savedAt: candidate.savedAt, values: candidate.values as T };
}

/**
 * Compare two form value objects for equality, ignoring key order.
 *
 * Used to decide whether a snapshot is worth offering: one that matches what
 * the server already holds is noise, not a recovery.
 */
export function sameValues(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(input: unknown): string {
  return JSON.stringify(input, (_key, value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = record[key];
        return acc;
      }, {});
  });
}

/** "just now" / "12 minutes ago" — the recovery bar's timestamp. */
export function relativeTime(savedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
