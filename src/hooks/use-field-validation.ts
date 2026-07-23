"use client";

import { useCallback, useMemo, useState } from "react";
import type { z } from "zod";
import { fieldErrors } from "@/lib/public-forms";

/**
 * Blur-then-live validation for the public forms.
 *
 * Validating on every keystroke shouts at someone halfway through typing an
 * email address, and validating only on submit means a resident fills in a long
 * form before learning the first field was wrong. So: a field's message appears
 * when it first loses focus, and from then on it re-checks on every change so
 * the message clears the moment it is fixed. That falls out of the design here
 * rather than needing its own branch — `errors` recomputes from `values`, and
 * `touched` only decides what is allowed on screen.
 *
 * The schema is the same object the Server Action validates with, so the
 * message shown here is the message the server would have returned. The server
 * still validates: it is a public HTTP endpoint and remains the authority.
 */
export function useFieldValidation<T extends z.ZodType>(schema: T, values: unknown) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    const result = schema.safeParse(values);
    return result.success ? {} : fieldErrors(result.error);
  }, [schema, values]);

  const isValid = Object.keys(errors).length === 0;

  /** The message to render for a field, or undefined while it is untouched. */
  const errorFor = useCallback(
    (key: string) => (touched[key] ? errors[key] : undefined),
    [errors, touched],
  );

  const markTouched = useCallback(
    (key: string) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true })),
    [],
  );

  /**
   * Props for the control itself. `aria-describedby` points at the message
   * `Field` renders, so a screen reader reads the problem with the field rather
   * than leaving the user to hunt for red text.
   */
  const fieldProps = useCallback(
    (key: string, id: string) => {
      const message = touched[key] ? errors[key] : undefined;
      return {
        onBlur: () => markTouched(key),
        "aria-invalid": message ? (true as const) : undefined,
        "aria-describedby": message ? `${id}-error` : undefined,
      };
    },
    [errors, touched, markTouched],
  );

  /**
   * Called on submit: reveal every message at once, then put the cursor in the
   * first field that needs work. On a form as long as /complaints/new a single
   * message at the bottom is easy to miss on a phone.
   *
   * Takes the form element rather than holding a ref — `event.currentTarget` in
   * the submit handler already is the form, and a ref returned alongside these
   * helpers makes every `v.errorFor(...)` in the JSX look like a ref read.
   *
   * Returns true when the form is clean and the caller should go ahead.
   */
  const revealAll = useCallback((form?: HTMLFormElement | null) => {
    const keys = Object.keys(errors);
    if (keys.length === 0) return true;
    setTouched((prev) => {
      const next = { ...prev };
      for (const key of keys) next[key] = true;
      return next;
    });
    if (form) {
      // Ask the DOM which invalid field comes first rather than trusting the
      // order of the schema's keys — the visual order is what the resident is
      // working through, and the two need not agree.
      for (const element of Array.from(form.elements)) {
        const name = (element as HTMLElement & { name?: string }).name;
        if (name && keys.includes(name)) {
          (element as HTMLElement).focus();
          break;
        }
      }
    }
    return false;
  }, [errors]);

  return { errors, isValid, errorFor, fieldProps, markTouched, revealAll };
}
