"use client";

/**
 * Advisory password-strength indicator (length + character variety). Purely
 * informational — it does NOT gate submit; the 10-character minimum is the
 * only hard rule, enforced server-side.
 */

const LEVELS = [
  { label: "Weak", filled: 1, bar: "bg-danger", text: "text-danger" },
  { label: "Fair", filled: 2, bar: "bg-brand-400", text: "text-brand-700" },
  { label: "Strong", filled: 3, bar: "bg-brand-600", text: "text-brand-800" },
] as const;

function scorePassword(value: string): 0 | 1 | 2 {
  let variety = 0;
  if (/[a-z]/.test(value)) variety += 1;
  if (/[A-Z]/.test(value)) variety += 1;
  if (/[0-9]/.test(value)) variety += 1;
  if (/[^A-Za-z0-9]/.test(value)) variety += 1;

  if (value.length < 10 || variety <= 1) return 0; // Weak
  if (value.length >= 14 && variety >= 3) return 2; // Strong
  return 1; // Fair
}

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const level = LEVELS[scorePassword(value)];

  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${index < level.filled ? level.bar : "bg-ink-200"}`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs font-medium ${level.text}`} aria-live="polite">
        Password strength: {level.label}
      </p>
    </div>
  );
}
