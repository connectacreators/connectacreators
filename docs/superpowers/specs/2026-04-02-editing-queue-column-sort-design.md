# Editing Queue Column Sort — Design Spec

## Goal

Add click-to-sort on all column headers in both the per-client Editing Queue and the Master Editing Queue. Sort state persists to localStorage per page.

## Behavior

- Click a column header → sort ASC (A→Z or low→high)
- Click the same header again → sort DESC (Z→A or high→low)
- Click a third time → clear sort (return to default fetch order)
- Only one column is sorted at a time
- Active column shows ↑ (ASC) or ↓ (DESC); inactive columns show a subtle muted ↕

## Sortable Columns

| Column | Sort type | Page |
|---|---|---|
| Title | String (localeCompare) | Both |
| Status | String | Both |
| Post Status | String | Both |
| Assignee | String | Both |
| Revisions | Numeric (unresolved count) | Both |
| Client | String | Master queue only |

Revisions sort is by `unresolvedCounts[item.id] ?? 0`.

## Persistence

- `sortCol` + `sortDir` saved together as JSON to localStorage
- Key `eq_sort` for per-client queue (`EditingQueue.tsx`)
- Key `meq_sort` for master queue (`MasterEditingQueue.tsx`)
- Loaded on mount; cleared from storage when sort is reset (third click)

## Architecture

### State

```typescript
const [sortCol, setSortCol] = useState<string | null>(null);
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
```

### Load from localStorage on mount

```typescript
useEffect(() => {
  const saved = localStorage.getItem('eq_sort'); // or 'meq_sort'
  if (saved) {
    const { col, dir } = JSON.parse(saved);
    setSortCol(col);
    setSortDir(dir);
  }
}, []);
```

### Toggle handler

```typescript
function handleSort(col: string) {
  if (sortCol === col) {
    if (sortDir === 'asc') {
      setSortDir('desc');
      localStorage.setItem('eq_sort', JSON.stringify({ col, dir: 'desc' }));
    } else {
      setSortCol(null);
      setSortDir('asc');
      localStorage.removeItem('eq_sort');
    }
  } else {
    setSortCol(col);
    setSortDir('asc');
    localStorage.setItem('eq_sort', JSON.stringify({ col, dir: 'asc' }));
  }
}
```

### Sorted items (useMemo)

Applied after filtering, before render:

```typescript
const sortedItems = useMemo(() => {
  if (!sortCol) return filteredItems;
  return [...filteredItems].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';
    if (sortCol === 'title') { aVal = a.reel_title ?? ''; bVal = b.reel_title ?? ''; }
    else if (sortCol === 'status') { aVal = a.status ?? ''; bVal = b.status ?? ''; }
    else if (sortCol === 'post_status') { aVal = a.post_status ?? ''; bVal = b.post_status ?? ''; }
    else if (sortCol === 'assignee') { aVal = a.assigned_editor ?? ''; bVal = b.assigned_editor ?? ''; }
    else if (sortCol === 'revisions') { aVal = unresolvedCounts[a.id] ?? 0; bVal = unresolvedCounts[b.id] ?? 0; }
    else if (sortCol === 'client') { aVal = a.clientName ?? ''; bVal = b.clientName ?? ''; } // master only
    const cmp = typeof aVal === 'number'
      ? aVal - bVal
      : aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
    return sortDir === 'asc' ? cmp : -cmp;
  });
}, [filteredItems, sortCol, sortDir, unresolvedCounts]);
```

### Sort icon component

Inline helper, no new file:

```typescript
function SortIcon({ col }: { col: string }) {
  if (sortCol !== col) return <span className="ml-1 opacity-30 text-xs">↕</span>;
  return <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}
```

### Column header markup

Replace static `<TableHead>` text with a clickable button:

```tsx
<TableHead
  className="font-semibold cursor-pointer select-none hover:text-foreground"
  onClick={() => handleSort('title')}
>
  Title <SortIcon col="title" />
</TableHead>
```

## Files Modified

- `src/pages/EditingQueue.tsx` — add sort state, handler, useMemo, update all TableHead cells
- `src/pages/MasterEditingQueue.tsx` — same changes, plus Client column, localStorage key `meq_sort`

## Not in scope

- Multi-column sort
- Server-side sorting (client-side is sufficient given typical queue sizes)
- Filtering by value (future work)
