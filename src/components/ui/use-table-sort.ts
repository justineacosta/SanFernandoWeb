"use client";

import { useMemo, useState } from "react";

type Dir = "asc" | "desc";

export function useTableSort<T>(
  rows: T[],
  initial: { key: string; dir: Dir },
  accessors: Record<string, (row: T) => string | number | null>,
) {
  const [sortKey, setSortKey] = useState(initial.key);
  const [sortDir, setSortDir] = useState<Dir>(initial.dir);

  const sorted = useMemo(() => {
    const get = accessors[sortKey];
    if (!get) return rows;
    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Null (e.g. undated) always sorts first, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return -1;
      if (bv === null) return 1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sortKey, sortDir, accessors]);

  function toggle(key: string) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  return { sorted, sortKey, sortDir, toggle };
}
