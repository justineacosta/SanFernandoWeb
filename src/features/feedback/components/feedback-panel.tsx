"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { CheckCircle2, ImageUp, MessageSquarePlus, Send, X } from "lucide-react";
import type { FeedbackCategory, PublicFeedbackValues } from "@/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/shared/turnstile-widget";
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

type FeedbackFormValues = Omit<PublicFeedbackValues, "pagePath">;

const EMPTY: FeedbackFormValues = {
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
  const [values, setValues] = useState<FeedbackFormValues>(EMPTY);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Escape reads the close handler through a ref so the keydown listener is
  // bound once per open rather than re-bound whenever the handler identity
  // changes — `handleClose` depends on `sent`, which changes mid-life.
  const closeRef = useRef<() => void>(() => {});
  const pendingRef = useRef(pending);
  // `pending` only flips once React commits, so the disabled button alone cannot
  // stop two clicks landing in the same tick — that would file the same report
  // twice. This ref closes that window.
  const submitting = useRef(false);

  const withPath: PublicFeedbackValues = { ...values, pagePath: pathname || "/" };
  const v = useFieldValidation(feedbackSchema, withPath);

  const clearScreenshot = useCallback(() => {
    setScreenshot(null);
    setFileError(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const reset = useCallback(() => {
    setValues(EMPTY);
    clearScreenshot();
    setSent(false);
    setError(null);
  }, [clearScreenshot]);

  /**
   * Closing a *filed* report clears it, so reopening starts fresh. Closing an
   * unfiled one keeps every field: a mis-click on the scrim mid-typing must not
   * erase what someone wrote.
   *
   * This lives in the close path rather than an open-effect on purpose — state
   * set inside an effect is what `react-hooks/set-state-in-effect` forbids, and
   * "closing a sent form clears it" is the more direct statement anyway.
   */
  const handleClose = useCallback(() => {
    if (sent) reset();
    onClose();
  }, [sent, reset, onClose]);

  useEffect(() => {
    closeRef.current = handleClose;
    pendingRef.current = pending;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!pendingRef.current) closeRef.current();
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

  // An object URL is a document-lifetime handle; without this the blob leaks.
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const set = <K extends keyof FeedbackFormValues>(key: K, value: FeedbackFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  /**
   * A pure picker: no network call happens here. The file is held in state and
   * uploaded by the action on submit, so an object can only exist once a row
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
    // Reveal every message and focus the first field that needs work, rather
    // than spending a round trip to be told the same thing.
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
      form.set("turnstileToken", turnstileToken ?? "");
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
      turnstileRef.current?.reset();
      setTurnstileToken(null);
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
              onClick={() => (pending ? undefined : handleClose())}
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
                  onClick={handleClose}
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
                    <Button variant="ghost" onClick={handleClose}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} noValidate>
                  <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium text-ink-700">Category</legend>
                      <div
                        role="radiogroup"
                        aria-label="Feedback category"
                        className="flex flex-wrap gap-2"
                      >
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
                          {/*
                            A plain <img>, not next/image: the source is a blob
                            URL with no known dimensions and nothing for the
                            optimizer to do.
                          */}
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
                            <p className="text-xs text-ink-500">
                              {formatFileSize(screenshot.size)}
                            </p>
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

                    <TurnstileWidget
                      ref={turnstileRef}
                      onVerify={setTurnstileToken}
                      className="flex justify-center"
                    />

                    {error ? (
                      <p role="alert" className="text-sm font-medium text-danger">
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
                    <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
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
