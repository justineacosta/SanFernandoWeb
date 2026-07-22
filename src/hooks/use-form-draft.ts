"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DraftScope,
  type DraftSnapshot,
  decodeSnapshot,
  draftKey,
  encodeSnapshot,
  isDraftKey,
  relativeTime,
  sameValues,
} from "@/lib/form-draft";

/**
 * A local recovery copy of a drawer's text fields (sub-project 8).
 *
 * It writes to `localStorage` and never to Postgres — for existing records as
 * much as new ones. Editing a published record does not change its status, so
 * a database autosave would push half-written text onto the live public page
 * on a timer. See the spec §2.1; this is the whole reason the hook exists in
 * this shape.
 *
 * The hook does not own the form's values. It is handed them, which is what
 * keeps files out: `File` state lives outside `values` in all seven forms, so
 * "text only" holds by construction rather than by a rule to remember.
 */

const DEBOUNCE_MS = 1500;

/**
 * Storage access is wrapped everywhere. Private browsing can make
 * `localStorage` throw on read as well as write, and losing autosave must
 * never cost someone the ability to save normally.
 */
function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to do, and nothing worth surfacing */
  }
}

/** Drop every recovery copy on this device. Called when signing out. */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && isDraftKey(key)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    /* see readItem */
  }
}

export interface FormDraft<T> {
  /** An offered recovery copy, or null. Never applied automatically (§2.4). */
  recovered: DraftSnapshot<T> | null;
  /**
   * "12 minutes ago", fixed at the moment the copy was found. Computed here
   * because reading the clock during render is impure; a label that ages while
   * the drawer sits open would also be re-rendering for no one's benefit.
   */
  recoveredLabel: string | null;
  /** When the local copy was last written, for the status line. */
  savedAt: number | null;
  /** Hide the bar, keep the copy. Used after restoring. */
  dismiss: () => void;
  /** Hide the bar and delete the copy. */
  discard: () => void;
  /** The work reached the server: delete the copy and re-baseline. */
  clear: () => void;
}

export function useFormDraft<T extends object>(
  userId: string | null,
  scope: DraftScope,
  recordId: string | null,
  values: T,
): FormDraft<T> {
  const key = userId ? draftKey(userId, scope, recordId) : null;

  const [recovered, setRecovered] = useState<DraftSnapshot<T> | null>(null);
  const [recoveredLabel, setRecoveredLabel] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  /**
   * What the server is believed to hold. Everything hangs off this: a snapshot
   * is only worth offering if it differs from the baseline, and values are
   * only worth writing if they differ from it. It is re-set on a successful
   * save, which is what stops the write below from immediately re-creating a
   * copy of work that has just been persisted.
   */
  const baselineRef = useRef<T>(values);
  const keyRef = useRef<string | null>(key);

  useEffect(() => {
    keyRef.current = key;
  });

  // Offer a recovery copy, once per key. Reading storage during render would
  // break SSR and desynchronise hydration, so it happens here.
  useEffect(() => {
    if (!key) return;
    const now = Date.now();
    const snapshot = decodeSnapshot<T>(readItem(key), now);
    if (!snapshot) return;
    if (sameValues(snapshot.values, baselineRef.current)) {
      // Identical to what the server already has: not a recovery, just noise.
      removeItem(key);
      return;
    }
    setRecovered(snapshot);
    setRecoveredLabel(relativeTime(snapshot.savedAt, now));
  }, [key]);

  // Write, debounced. Untouched forms never write: values still equal the
  // baseline, so opening a drawer and closing it leaves nothing behind.
  useEffect(() => {
    if (!key) return;
    if (sameValues(values, baselineRef.current)) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const raw = encodeSnapshot(values, now);
      // Over the size cap, or unserialisable: skip silently rather than claim
      // a copy that does not exist.
      if (!raw) return;
      if (writeItem(key, raw)) setSavedAt(now);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [key, values]);

  const dismiss = useCallback(() => {
    setRecovered(null);
    setRecoveredLabel(null);
  }, []);

  const discard = useCallback(() => {
    if (keyRef.current) removeItem(keyRef.current);
    setRecovered(null);
    setRecoveredLabel(null);
    setSavedAt(null);
  }, []);

  /**
   * Called by the form after a successful save. Re-baselining to the saved
   * values matters as much as removing the key: without it the write effect
   * would fire again the moment the record id changes and leave a recovery
   * copy of work that is already on the server.
   */
  const clear = useCallback((nextBaseline?: T) => {
    if (keyRef.current) removeItem(keyRef.current);
    if (nextBaseline) baselineRef.current = nextBaseline;
    setRecovered(null);
    setRecoveredLabel(null);
    setSavedAt(null);
  }, []);

  const clearWithValues = useCallback(() => clear(values), [clear, values]);

  return { recovered, recoveredLabel, savedAt, dismiss, discard, clear: clearWithValues };
}
