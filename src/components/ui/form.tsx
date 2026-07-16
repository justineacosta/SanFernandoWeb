import { cn } from "@/lib/utils";

export const fieldClasses =
  "w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 shadow-sm transition-colors placeholder:text-ink-400 focus:outline-none focus-visible:border-brand-400 focus-visible:ring-4 focus-visible:ring-brand-400/20 focus:border-brand-400 focus:ring-4 focus:ring-brand-400/20";

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
        className="text-sm font-medium text-ink-700"
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
        "h-5 w-5 rounded-md border-ink-300 text-brand-500 focus:ring-brand-400/30",
        className,
      )}
      {...props}
    />
  );
}
