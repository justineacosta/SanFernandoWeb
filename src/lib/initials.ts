/**
 * Initials for the avatar fallback.
 *
 * Its own module, not a helper inside `<Avatar>`: this is the only pure logic
 * in that component, and a `.tsx` importing `next/image` cannot be pulled into
 * the node-environment Vitest suite.
 *
 * Returns "" for an empty name rather than a placeholder — the caller decides
 * what nothing looks like.
 */
export function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
