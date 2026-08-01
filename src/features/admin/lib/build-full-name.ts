/** Joins split name parts for display/storage. An empty part (no middle name) is skipped. */
export function buildFullName(firstName: string, middleName: string, lastName: string): string {
  return [firstName, middleName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
