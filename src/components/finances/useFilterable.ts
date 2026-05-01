import { useMemo, useState, useCallback } from "react";

export type ColumnFilter =
  | { kind: "set"; values: Set<string> }
  | { kind: "range"; min: number | null; max: number | null }
  | { kind: "tristate"; mode: "all" | "yes" | "no" };

export type FilterMap<K extends string> = Partial<Record<K, ColumnFilter>>;

export function useFilterable<T, K extends string>(
  rows: T[],
  read: (row: T, key: K) => string | number | boolean | null,
) {
  const [filters, setFilters] = useState<FilterMap<K>>({});

  const filtered = useMemo(() => {
    const entries = Object.entries(filters) as [K, ColumnFilter][];
    if (entries.length === 0) return rows;
    return rows.filter((row) =>
      entries.every(([key, filter]) => {
        const v = read(row, key);
        if (filter.kind === "set") {
          if (filter.values.size === 0) return true;
          return filter.values.has(String(v ?? ""));
        }
        if (filter.kind === "range") {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isNaN(n)) return false;
          if (filter.min != null && n < filter.min) return false;
          if (filter.max != null && n > filter.max) return false;
          return true;
        }
        const truthy = v === true || v === "true" || v === 1;
        if (filter.mode === "all") return true;
        if (filter.mode === "yes") return truthy;
        return !truthy;
      }),
    );
  }, [rows, filters, read]);

  const setFilter = useCallback((key: K, filter: ColumnFilter | null) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (filter == null) delete next[key];
      else next[key] = filter;
      return next;
    });
  }, []);

  const isFiltered = useCallback((key: K) => {
    const f = filters[key];
    if (!f) return false;
    if (f.kind === "set") return f.values.size > 0;
    if (f.kind === "range") return f.min != null || f.max != null;
    return f.mode !== "all";
  }, [filters]);

  return { filtered, filters, setFilter, isFiltered };
}
