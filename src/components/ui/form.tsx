import { cn } from "@/lib/utils";

// The `aria-invalid:` pair is the whole visual error treatment: setting the
// ARIA attribute is what turns a field red, so the two cannot get out of step
// the way a separate `isError` class prop would.
export const fieldClasses =
  "w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 focus:outline-none focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/20 aria-invalid:border-danger aria-invalid:focus:border-danger aria-invalid:focus:ring-danger/20 aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/20";

interface FieldProps {
  label: string;
  htmlFor: string;
  className?: string;
  /**
   * Validation message. The id is derived from `htmlFor`, so the control points
   * at it with `aria-describedby={`${htmlFor}-error`}` — see
   * `useFieldValidation`, which builds that attribute for you.
   */
  error?: string;
  /** Guidance shown under the control while the field is valid. */
  hint?: string;
  children: React.ReactNode;
}

/** Label + control wrapper enforcing consistent field spacing. */
export function Field({ label, htmlFor, className, error, hint, children }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-ink-700"
      >
        {label}
      </label>
      {children}
      {error ? (
        // `role="alert"` so the message is announced when it appears, not only
        // when the field is next focused.
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, className)} {...props} />;
}

export function Textarea({
  className,
  ref,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(fieldClasses, className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-5 w-5 rounded-md border-ink-300 text-brand-500 focus:ring-brand-400/30",
        className,
      )}
      {...props}
    />
  );
}
