import { useCallback, useMemo, useState } from "react";

export function useSelection<T extends { id: string }>(rows: T[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drop ids that no longer exist in the current row set
  const valid = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (ids.has(id)) next.add(id);
      else changed = true;
    }
    return changed ? next : selectedIds;
  }, [rows, selectedIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === rows.length && rows.length > 0) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectedRows = useMemo(
    () => rows.filter((r) => valid.has(r.id)),
    [rows, valid],
  );

  return {
    selectedIds: valid,
    selectedRows,
    isAllSelected: rows.length > 0 && valid.size === rows.length,
    isAnySelected: valid.size > 0,
    toggle,
    toggleAll,
    clear,
  };
}
