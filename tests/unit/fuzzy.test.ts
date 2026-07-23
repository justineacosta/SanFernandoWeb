import { describe, expect, it } from "vitest";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";

/**
 * The match contract from `src/lib/fuzzy.ts`, pinned.
 *
 * These cases were proved by hand while choosing the matcher (sub-project 4).
 * Two of them are the reason a whole-string scorer was rejected: "sanots" must
 * reach Santos while "banana" must not reach Barangay. Any future change that
 * loosens the matcher to fix the first will break the second here rather than
 * in production.
 */

interface Row {
  name: string;
}

const ROWS: Row[] = [
  { name: "Juan Dela Cruz" },
  { name: "Maria Santos" },
  { name: "Barangay Certificate" },
  { name: "Certificate of Indigency" },
  { name: "Barangay Official Directory" },
  { name: "Ordinance 2023-014 on Solid Waste" },
];

const filter = (q: string) => fuzzyFilter(ROWS, q, (r) => r.name).map((r) => r.name);

describe("fuzzyFilter", () => {
  it("returns everything for an empty or whitespace query", () => {
    expect(filter("")).toHaveLength(ROWS.length);
    expect(filter("   ")).toHaveLength(ROWS.length);
  });

  it("matches a partial word as a substring", () => {
    expect(filter("cert")).toEqual([
      "Barangay Certificate",
      "Certificate of Indigency",
    ]);
  });

  it("is case-insensitive in both directions", () => {
    expect(filter("BARANGAY")).toHaveLength(2);
    expect(filter("juan")).toEqual(["Juan Dela Cruz"]);
  });

  it("tolerates a missing letter", () => {
    expect(filter("offcal")).toEqual(["Barangay Official Directory"]);
  });

  it("tolerates transposed letters", () => {
    expect(filter("sanots")).toEqual(["Maria Santos"]);
    expect(filter("ordinacne")).toEqual(["Ordinance 2023-014 on Solid Waste"]);
  });

  it("tolerates a doubled letter", () => {
    expect(filter("baranggay")).toHaveLength(2);
  });

  it("requires every term to match, so extra terms narrow", () => {
    expect(filter("juan dela")).toEqual(["Juan Dela Cruz"]);
    expect(filter("barangay certificate")).toEqual(["Barangay Certificate"]);
  });

  it("returns nothing when one term of several matches nothing", () => {
    expect(filter("juan banana")).toEqual([]);
    expect(filter("barangay banana")).toEqual([]);
  });

  it("returns nothing for a query unlike any row", () => {
    expect(filter("zzzzzz")).toEqual([]);
    expect(filter("banana")).toEqual([]);
  });

  it("does not let a short term drift onto an unrelated word", () => {
    // Budget is 1 for terms of four characters or fewer. "juan" and "cruz"
    // differ from each other by 4, so a query cannot match by accident.
    expect(filter("cruz")).toEqual(["Juan Dela Cruz"]);
    expect(filter("wste")).toEqual(["Ordinance 2023-014 on Solid Waste"]);
    expect(filter("czur")).toEqual([]);
    // Two edits away and only four characters long, so the budget refuses it.
    expect(filter("waze")).toEqual([]);
  });

  it("matches digits inside a word", () => {
    expect(filter("2023")).toEqual(["Ordinance 2023-014 on Solid Waste"]);
  });

  it("treats LIKE metacharacters as ordinary text", () => {
    // The SQL half had a defect here (migration 0017); the JS half never did,
    // but the contract is shared so the case is pinned on both sides.
    expect(filter("%")).toEqual([]);
    expect(filter("o_dinance")).toEqual(["Ordinance 2023-014 on Solid Waste"]);
    expect(filter("o%e")).toEqual([]);
  });

  it("preserves input order rather than ranking by relevance", () => {
    const rows = [{ name: "zeta cert" }, { name: "alpha certificate" }];
    expect(fuzzyFilter(rows, "cert", (r) => r.name).map((r) => r.name)).toEqual([
      "zeta cert",
      "alpha certificate",
    ]);
  });

  it("searches every field the haystack is built from", () => {
    const rows = [{ first: "Juan", last: "Dela Cruz", ticket: "APP-2026-0007" }];
    const run = (q: string) =>
      fuzzyFilter(rows, q, (r) => haystack(r.first, r.last, r.ticket));
    expect(run("0007")).toHaveLength(1);
    expect(run("dela")).toHaveLength(1);
    expect(run("nowhere")).toHaveLength(0);
  });
});

describe("haystack", () => {
  it("joins present values with a single space", () => {
    expect(haystack("Juan", "Dela Cruz")).toBe("Juan Dela Cruz");
  });

  it("drops null, undefined, and blank parts so no double separator forms", () => {
    expect(haystack("Juan", null, undefined, "   ", "Cruz")).toBe("Juan Cruz");
  });

  it("returns an empty string when everything is absent", () => {
    expect(haystack(null, undefined, "")).toBe("");
  });
});
