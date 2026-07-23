import type { LegislativeType } from "@/types";

const TYPE_LABELS: Record<LegislativeType, string> = {
  ordinance: "Ordinance",
  resolution: "Resolution",
};

/**
 * The widest sequence a document number may carry.
 *
 * This is not a stylistic limit — `legislativeSortKey` multiplies the year by
 * one more than this, so a wider sequence would overflow into the neighbouring
 * year's range and silently mis-order the table. The `seq_no < 10000` check
 * constraint in migration 0024 enforces the same bound in the database. The
 * two must move together.
 */
export const MAX_SEQ_NO = 9999;

/**
 * The public document number, composed from the three fields an encoder
 * actually types. Stored on the row so SQL search and the audit log have a
 * human-readable string to work with.
 *
 * Padded to a minimum of two digits so a column of numbers lines up; a
 * three-digit sequence is left as it is rather than truncated.
 */
export function formatLegislativeNumber(
  docType: LegislativeType,
  seqNo: number,
  year: number,
): string {
  return `${TYPE_LABELS[docType]} No. ${String(seqNo).padStart(2, "0")}, ${year}`;
}

/**
 * One number expressing "year descending, sequence ascending within the year",
 * for a sorter that applies a single direction to a single key.
 *
 * Subtracting the sequence inverts it inside its year, so sorting these
 * descending yields 2025 → 03, 04, 05, then 2024 → 03, 04, 05. Sorting them
 * ascending gives the exact mirror, which is why the tables pin the default
 * direction to "desc" rather than leaving it to chance.
 */
export function legislativeSortKey(year: number, seqNo: number): number {
  return year * (MAX_SEQ_NO + 1) - seqNo;
}
