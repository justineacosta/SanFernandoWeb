import { describe, expect, it } from "vitest";
import {
  MAX_SEQ_NO,
  formatLegislativeNumber,
  legislativeSortKey,
} from "@/lib/legislative-number";

describe("formatLegislativeNumber", () => {
  it("pads a single-digit sequence to two digits", () => {
    expect(formatLegislativeNumber("ordinance", 5, 2024)).toBe("Ordinance No. 05, 2024");
  });

  it("leaves a two-digit sequence alone", () => {
    expect(formatLegislativeNumber("ordinance", 12, 2024)).toBe("Ordinance No. 12, 2024");
  });

  it("does not truncate a sequence past two digits", () => {
    expect(formatLegislativeNumber("resolution", 123, 2025)).toBe("Resolution No. 123, 2025");
  });

  it("labels each document type", () => {
    expect(formatLegislativeNumber("resolution", 3, 2025)).toBe("Resolution No. 03, 2025");
  });
});

describe("legislativeSortKey", () => {
  /** Sorted descending, which is how the tables consume this key. */
  function order(pairs: [year: number, seq: number][]): string[] {
    return [...pairs]
      .sort((a, b) => legislativeSortKey(b[0], b[1]) - legislativeSortKey(a[0], a[1]))
      .map(([year, seq]) => `${year}-${seq}`);
  }

  it("puts the newest year first and counts up inside it", () => {
    expect(
      order([
        [2024, 9],
        [2025, 4],
        [2023, 11],
        [2025, 3],
        [2024, 4],
        [2025, 5],
      ]),
    ).toEqual(["2025-3", "2025-4", "2025-5", "2024-4", "2024-9", "2023-11"]);
  });

  it("ranks a later year above an earlier one whatever the sequences", () => {
    expect(legislativeSortKey(2025, MAX_SEQ_NO)).toBeGreaterThan(legislativeSortKey(2024, 1));
  });

  it("keeps the widest permitted sequence inside its own year", () => {
    // The boundary the seq_no < 10000 check constraint protects: one more
    // digit and the key would cross into the neighbouring year's range.
    expect(legislativeSortKey(2024, 1)).toBeGreaterThan(legislativeSortKey(2024, MAX_SEQ_NO));
    expect(legislativeSortKey(2024, MAX_SEQ_NO)).toBeGreaterThan(legislativeSortKey(2023, 1));
  });
});
