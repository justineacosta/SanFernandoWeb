import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-lg border border-line bg-surface-low p-3 text-base text-ink transition-all placeholder:text-ink-muted/60 focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary";

interface FieldProps {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}

/** Label + control wrapper enforcing consistent field spacing. */
export function Field({ label, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold uppercase tracking-wide text-ink-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClasses, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClasses, className)} {...props} />;
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-5 w-5 rounded border-line text-primary focus:ring-secondary",
        className,
      )}
      {...props}
    />
  );
}
