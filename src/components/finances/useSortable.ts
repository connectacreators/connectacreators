import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc" | null;
export interface SortState<K extends string> {
  key: K | null;
  dir: SortDir;
}

export function useSortable<T, K extends string>(
  rows: T[],
  defaults: { key: K; dir: SortDir },
  compareBy: (row: T, key: K) => string | number | null,
) {
  const [sort, setSort] = useState<SortState<K>>(defaults);

  const sorted = useMemo(() => {
    if (!sort.key || !sort.dir) return rows;
    const k = sort.key;
    const dir = sort.dir;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = compareBy(a, k);
      const bv = compareBy(b, k);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      if (as === bs) return 0;
      return dir === "asc" ? (as < bs ? -1 : 1) : (as < bs ? 1 : -1);
    });
    return copy;
  }, [rows, sort.key, sort.dir, compareBy]);

  function toggleSort(key: K) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      if (prev.dir === "desc") return { key: null, dir: null };
      return { key, dir: "asc" };
    });
  }

  return { sorted, sort, toggleSort };
}
