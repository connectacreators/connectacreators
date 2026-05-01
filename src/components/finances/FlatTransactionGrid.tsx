import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUp, ArrowUpRight, ArrowDown, ChevronDown, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  FinanceTransaction,
  NewFinanceTransaction,
  FinanceCategory,
} from "@/hooks/useFinanceTransactions";
import { TextCell } from "./cells/TextCell";
import { NumberCell } from "./cells/NumberCell";
import { DateCell } from "./cells/DateCell";
import { SelectCell } from "./cells/SelectCell";
import { ToggleCell } from "./cells/ToggleCell";
import { AttachmentCell } from "./cells/AttachmentCell";
import { useSortable } from "./useSortable";
import { useFilterable, type ColumnFilter } from "./useFilterable";
import { useSelection } from "./useSelection";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "./categoryColors";

type Props = {
  kind: "income" | "expense";
  rows: FinanceTransaction[];
  onUpdate: (id: string, patch: Partial<NewFinanceTransaction>) => Promise<FinanceTransaction | null>;
  onDelete: (id: string) => Promise<boolean>;
  onCreate: (tx: NewFinanceTransaction) => Promise<FinanceTransaction | null>;
  defaultDate: string; // YYYY-MM-DD anchor for new rows
};

type SortKey = "client" | "vendor" | "category" | "date" | "description" | "amount" | "is_ar";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function FlatTransactionGrid({ kind, rows, onUpdate, onDelete, onCreate, defaultDate }: Props) {
  const isIncome = kind === "income";

  // Filtering
  const { filtered, setFilter, isFiltered } = useFilterable<FinanceTransaction, SortKey>(
    rows,
    (r, k) => {
      switch (k) {
        case "client": return r.client ?? "";
        case "vendor": return r.vendor ?? "";
        case "category": return r.category;
        case "date": return r.date;
        case "description": return r.description ?? "";
        case "amount": return r.amount;
        case "is_ar": return r.is_ar;
      }
    },
  );

  // Sorting
  const { sorted, sort, toggleSort } = useSortable<FinanceTransaction, SortKey>(
    filtered,
    { key: "date", dir: "desc" },
    (r, k) => {
      switch (k) {
        case "client": return r.client ?? "";
        case "vendor": return r.vendor ?? "";
        case "category": return r.category;
        case "date": return r.date;
        case "description": return r.description ?? "";
        case "amount": return r.amount;
        case "is_ar": return r.is_ar ? 1 : 0;
      }
    },
  );

  // Selection
  const { selectedIds, selectedRows, isAllSelected, isAnySelected, toggle, toggleAll, clear } = useSelection(sorted);

  // Add-row draft
  const [draft, setDraft] = useState<Partial<NewFinanceTransaction> | null>(null);
  const draftCommitting = useRef(false);

  const total = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered]);

  // Suggestion lists for autocomplete (last 90 days are already in `rows`-ish — use whatever we have)
  const clientSuggestions = useMemo(() => uniqueValues(rows, (r) => r.client), [rows]);
  const vendorSuggestions = useMemo(() => uniqueValues(rows, (r) => r.vendor), [rows]);

  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // ---- Cell-level update handler ----
  const update = useCallback(async (id: string, patch: Partial<NewFinanceTransaction>) => {
    const result = await onUpdate(id, patch);
    if (!result) toast.error("Couldn't save change");
  }, [onUpdate]);

  // ---- Bulk actions ----
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  async function bulkRecategorize(category: FinanceCategory) {
    const ids = Array.from(selectedIds);
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      const r = await onUpdate(id, { category });
      if (!r) failed++;
    }));
    if (failed > 0) toast.error(`Updated ${ids.length - failed}, failed ${failed}`);
    else toast.success(`Recategorized ${ids.length} entries`);
    clear();
  }

  async function bulkMarkAR() {
    const ids = Array.from(selectedIds);
    const anyOn = selectedRows.some((r) => r.is_ar);
    const next = !anyOn;
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      const r = await onUpdate(id, { is_ar: next });
      if (!r) failed++;
    }));
    if (failed > 0) toast.error(`Updated ${ids.length - failed}, failed ${failed}`);
    else toast.success(`${next ? "Marked" : "Cleared"} A/R for ${ids.length} entries`);
    clear();
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    setConfirmingBulkDelete(false);
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      const ok = await onDelete(id);
      if (!ok) failed++;
    }));
    if (failed > 0) toast.error(`Deleted ${ids.length - failed}, failed ${failed}`);
    else toast.success(`Deleted ${ids.length} entries`);
    clear();
  }

  // ---- Add row ----
  function startDraft() {
    setDraft({
      type: kind,
      amount: 0,
      vendor: null,
      client: null,
      category: isIncome ? "SMMA" : "Other",
      description: null,
      payment_method: null,
      date: defaultDate,
      is_ar: false,
      raw_input: null,
      attachment_url: null,
      recurring_subscription_id: null,
      deductible_amount: null,
    });
  }

  const draftIsValid = (d: Partial<NewFinanceTransaction>) => {
    const hasParty = isIncome ? !!d.client?.trim() : !!d.vendor?.trim();
    return hasParty && (d.amount ?? 0) > 0;
  };

  async function commitDraftIfValid(next: Partial<NewFinanceTransaction>) {
    if (draftCommitting.current) return;
    if (!draftIsValid(next)) return;
    draftCommitting.current = true;
    const created = await onCreate(next as NewFinanceTransaction);
    draftCommitting.current = false;
    if (created) {
      setDraft(null);
    } else {
      toast.error("Couldn't create entry");
    }
  }

  function patchDraft(patch: Partial<NewFinanceTransaction>) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void commitDraftIfValid(next);
      return next;
    });
  }

  function discardDraft() { setDraft(null); }

  // Color theme for the section
  const themeColor = isIncome ? "#10b981" : "#ef4444";
  const themeGradient = isIncome
    ? "linear-gradient(180deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))"
    : "linear-gradient(180deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))";
  const SectionIcon = isIncome ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.18)",
        borderRadius: 10,
        overflow: "hidden",
        background: "#0a0d14",
        marginBottom: 16,
      }}
    >
      {/* Section header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: "10px 12px",
          background: themeGradient,
          borderBottom: "1px solid rgba(148,163,184,0.12)",
        }}
      >
        <div className="flex items-center gap-2" style={{ color: themeColor, fontWeight: 700, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase" }}>
          <SectionIcon className="w-4 h-4" />
          <span>{isIncome ? "Income" : "Expenses"} · {filtered.length} {filtered.length === 1 ? "row" : "rows"}</span>
        </div>
        <div style={{ color: themeColor, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {USD.format(total)}
        </div>
      </div>

      {/* Bulk bar */}
      {isAnySelected && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: "8px 12px",
            background: "rgba(34,211,238,0.12)",
            borderBottom: "1px solid rgba(34,211,238,0.20)",
            color: "#22d3ee",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span>{selectedIds.size} selected</span>
          <div className="flex gap-1.5">
            <Select onValueChange={(v) => bulkRecategorize(v as FinanceCategory)}>
              <SelectTrigger
                className="h-6 text-[10px] gap-1 border-cyan-500/30 bg-cyan-500/10 text-cyan-300 px-2"
                style={{ minWidth: "auto" }}
              >
                <SelectValue placeholder="Recategorize" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-cyan-500/30 bg-cyan-500/10 text-cyan-300" onClick={bulkMarkAR}>
              {selectedRows.some((r) => r.is_ar) ? "Clear A/R" : "Mark A/R"}
            </Button>
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-red-500/30 bg-red-500/10 text-red-400" onClick={() => setConfirmingBulkDelete(true)}>
              <Trash2 className="w-2.5 h-2.5 mr-1" /> Delete
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={clear}>
              <X className="w-2.5 h-2.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <Th width={28}>
                <Checkbox checked={isAllSelected} onChange={toggleAll} ariaLabel="Select all rows" />
              </Th>
              <SortHeader<SortKey>
                label={isIncome ? "Client" : "Vendor"}
                k={isIncome ? "client" : "vendor"}
                sort={sort}
                onSort={toggleSort}
                filter={
                  <SetFilter
                    values={uniqueValues(rows, isIncome ? (r) => r.client : (r) => r.vendor)}
                    isFiltered={isFiltered(isIncome ? "client" : "vendor")}
                    onChange={(v) => setFilter(isIncome ? "client" : "vendor", v)}
                  />
                }
              />
              {!isIncome && (
                <SortHeader<SortKey>
                  label="Category"
                  k="category"
                  sort={sort}
                  onSort={toggleSort}
                  filter={
                    <SetFilter
                      values={EXPENSE_CATEGORIES}
                      isFiltered={isFiltered("category")}
                      onChange={(v) => setFilter("category", v)}
                    />
                  }
                />
              )}
              <SortHeader<SortKey> label="Date" k="date" sort={sort} onSort={toggleSort} />
              <SortHeader<SortKey> label="Description" k="description" sort={sort} onSort={toggleSort} />
              <SortHeader<SortKey>
                label="Amount"
                k="amount"
                align="right"
                sort={sort}
                onSort={toggleSort}
                filter={
                  <RangeFilter
                    isFiltered={isFiltered("amount")}
                    onChange={(v) => setFilter("amount", v)}
                  />
                }
              />
              <SortHeader<SortKey>
                label="A/R"
                k="is_ar"
                sort={sort}
                onSort={toggleSort}
                filter={
                  <TristateFilter
                    isFiltered={isFiltered("is_ar")}
                    onChange={(v) => setFilter("is_ar", v)}
                  />
                }
              />
              {!isIncome && <Th width={28} />}
              <Th width={28} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <Row
                key={r.id}
                row={r}
                isIncome={isIncome}
                selected={selectedIds.has(r.id)}
                onToggle={() => toggle(r.id)}
                onUpdate={(patch) => update(r.id, patch)}
                onDelete={() => onDelete(r.id)}
                clientSuggestions={clientSuggestions}
                vendorSuggestions={vendorSuggestions}
                categories={categories}
              />
            ))}
            {draft && (
              <DraftRow
                draft={draft}
                isIncome={isIncome}
                onPatch={patchDraft}
                onDiscard={discardDraft}
                clientSuggestions={clientSuggestions}
                vendorSuggestions={vendorSuggestions}
                categories={categories}
              />
            )}
            {sorted.length === 0 && !draft && (
              <tr>
                <td colSpan={isIncome ? 7 : 9} style={{ padding: "20px 12px", color: "rgba(148,163,184,0.5)", textAlign: "center", fontSize: 11 }}>
                  No {isIncome ? "income" : "expense"} entries match. Click below to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      {!draft && (
        <button
          type="button"
          onClick={startDraft}
          className="flex items-center w-full text-left"
          style={{
            padding: "10px 12px",
            color: "rgba(148,163,184,0.6)",
            fontSize: 11,
            background: "transparent",
            borderTop: "1px dashed rgba(148,163,184,0.18)",
          }}
        >
          <Plus className="w-3 h-3 mr-2" />
          Add {isIncome ? "income" : "expense"} row…
        </button>
      )}

      {/* Bulk-delete confirm dialog */}
      <Dialog open={confirmingBulkDelete} onOpenChange={setConfirmingBulkDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} entries?</DialogTitle>
            <DialogDescription>
              This soft-deletes the selected rows. They won't appear in totals or charts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingBulkDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={bulkDelete}>Delete {selectedIds.size}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Cells / helpers ─────────────────────────────────────────────────────────

function Th({ children, width }: { children?: React.ReactNode; width?: number }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "7px 10px",
        background: "rgba(255,255,255,0.02)",
        color: "#94a3b8",
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        borderBottom: "1px solid rgba(148,163,184,0.15)",
        width,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function SortHeader<K extends string>({
  label,
  k,
  sort,
  onSort,
  filter,
  align = "left",
}: {
  label: string;
  k: K;
  sort: { key: K | null; dir: "asc" | "desc" | null };
  onSort: (k: K) => void;
  filter?: React.ReactNode;
  align?: "left" | "right";
}) {
  const active = sort.key === k && sort.dir != null;
  return (
    <th
      style={{
        textAlign: align,
        padding: "7px 10px",
        background: active ? "rgba(34,211,238,0.05)" : "rgba(255,255,255,0.02)",
        color: active ? "#22d3ee" : "#94a3b8",
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        borderBottom: "1px solid rgba(148,163,184,0.15)",
        whiteSpace: "nowrap",
      }}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <button
          type="button"
          onClick={() => onSort(k)}
          className="bg-transparent border-0 cursor-pointer flex items-center gap-1"
          style={{ color: "inherit", fontSize: "inherit", fontWeight: "inherit", letterSpacing: "inherit", textTransform: "inherit", padding: 0 }}
        >
          {label}
          {active && (sort.dir === "asc"
            ? <ArrowUp className="w-2.5 h-2.5" />
            : <ArrowDown className="w-2.5 h-2.5" />)}
        </button>
        {filter}
      </div>
    </th>
  );
}

function Checkbox({ checked, onChange, ariaLabel }: { checked: boolean; onChange: () => void; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-label={ariaLabel}
      aria-pressed={checked}
      className="inline-flex items-center justify-center cursor-pointer"
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        border: checked ? "1.5px solid #22d3ee" : "1.5px solid rgba(148,163,184,0.5)",
        background: checked ? "#22d3ee" : "transparent",
        color: "#0a0d14",
        fontSize: 9,
        fontWeight: 700,
      }}
    >
      {checked && "✓"}
    </button>
  );
}

function SetFilter({ values, isFiltered, onChange }: {
  values: string[];
  isFiltered: boolean;
  onChange: (filter: ColumnFilter | null) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-transparent border-0 cursor-pointer flex items-center"
          style={{ color: "inherit" }}
          aria-label="Filter"
        >
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          {isFiltered && (
            <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: "#22d3ee", marginLeft: 3 }} />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-2 max-h-72 overflow-auto">
        <div className="space-y-0.5">
          {values.length === 0 && <div className="text-xs text-muted-foreground px-1">No values</div>}
          {values.map((v) => {
            const checked = picked.has(v);
            return (
              <label key={v} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-muted/40 rounded">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(picked);
                    if (checked) next.delete(v); else next.add(v);
                    setPicked(next);
                    onChange(next.size === 0 ? null : { kind: "set", values: next });
                  }}
                />
                <span className="truncate">{v || "(empty)"}</span>
              </label>
            );
          })}
        </div>
        {picked.size > 0 && (
          <button
            type="button"
            className="w-full text-[10px] text-cyan-400 mt-1 py-1 rounded hover:bg-muted/40"
            onClick={() => { setPicked(new Set()); onChange(null); }}
          >
            Clear filter
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RangeFilter({ isFiltered, onChange }: { isFiltered: boolean; onChange: (f: ColumnFilter | null) => void }) {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-transparent border-0 cursor-pointer flex items-center"
          style={{ color: "inherit" }}
          aria-label="Filter range"
        >
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          {isFiltered && <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: "#22d3ee", marginLeft: 3 }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-2">
        <div className="space-y-1">
          <input
            type="number"
            placeholder="Min"
            value={min}
            onChange={(e) => {
              setMin(e.target.value);
              onChange({
                kind: "range",
                min: e.target.value ? Number(e.target.value) : null,
                max: max ? Number(max) : null,
              });
            }}
            className="w-full text-xs px-2 py-1 rounded bg-muted border border-border/50 outline-none"
          />
          <input
            type="number"
            placeholder="Max"
            value={max}
            onChange={(e) => {
              setMax(e.target.value);
              onChange({
                kind: "range",
                min: min ? Number(min) : null,
                max: e.target.value ? Number(e.target.value) : null,
              });
            }}
            className="w-full text-xs px-2 py-1 rounded bg-muted border border-border/50 outline-none"
          />
          {(min || max) && (
            <button
              type="button"
              className="w-full text-[10px] text-cyan-400 mt-1 py-1 rounded hover:bg-muted/40"
              onClick={() => { setMin(""); setMax(""); onChange(null); }}
            >
              Clear filter
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TristateFilter({ isFiltered, onChange }: { isFiltered: boolean; onChange: (f: ColumnFilter | null) => void }) {
  const [mode, setMode] = useState<"all" | "yes" | "no">("all");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="bg-transparent border-0 cursor-pointer flex items-center"
          style={{ color: "inherit" }}
          aria-label="Filter A/R"
        >
          <ChevronDown className="w-2.5 h-2.5 opacity-60" />
          {isFiltered && <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: 999, background: "#22d3ee", marginLeft: 3 }} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-36 p-1">
        {(["all", "yes", "no"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              onChange(m === "all" ? null : { kind: "tristate", mode: m });
            }}
            className={`w-full text-left px-2 py-1 text-xs rounded ${mode === m ? "bg-cyan-500/15 text-cyan-300" : "hover:bg-muted/40 text-foreground"}`}
          >
            {m === "all" ? "All" : m === "yes" ? "A/R only" : "Non-A/R only"}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Row({
  row,
  isIncome,
  selected,
  onToggle,
  onUpdate,
  onDelete,
  clientSuggestions,
  vendorSuggestions,
  categories,
}: {
  row: FinanceTransaction;
  isIncome: boolean;
  selected: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<NewFinanceTransaction>) => void;
  onDelete: () => void;
  clientSuggestions: string[];
  vendorSuggestions: string[];
  categories: FinanceCategory[];
}) {
  return (
    <tr
      style={{
        background: selected ? "rgba(34,211,238,0.07)" : undefined,
        borderBottom: "1px solid rgba(148,163,184,0.06)",
      }}
    >
      <td style={td()}><Checkbox checked={selected} onChange={onToggle} ariaLabel="Select row" /></td>
      <td style={td()}>
        {isIncome ? (
          <TextCell
            value={row.client ?? ""}
            onCommit={(v) => onUpdate({ client: v || null })}
            placeholder="Client name"
            ariaLabel={`Client for entry ${row.id}`}
            suggestions={clientSuggestions}
          />
        ) : (
          <TextCell
            value={row.vendor ?? ""}
            onCommit={(v) => onUpdate({ vendor: v || null })}
            placeholder="Vendor name"
            ariaLabel={`Vendor for entry ${row.id}`}
            suggestions={vendorSuggestions}
          />
        )}
      </td>
      {!isIncome && (
        <td style={td()}>
          <SelectCell
            value={row.category}
            options={categories}
            onCommit={(c) => onUpdate({ category: c })}
            ariaLabel="Category"
          />
        </td>
      )}
      <td style={td()}>
        <DateCell value={row.date} onCommit={(d) => onUpdate({ date: d })} ariaLabel="Date" />
      </td>
      <td style={td()}>
        <TextCell
          value={row.description ?? ""}
          onCommit={(v) => onUpdate({ description: v || null })}
          placeholder="Description"
          ariaLabel="Description"
          muted
        />
      </td>
      <td style={td()}>
        <NumberCell value={row.amount} onCommit={(n) => onUpdate({ amount: n })} ariaLabel="Amount" />
      </td>
      <td style={td()}>
        <ToggleCell
          value={row.is_ar}
          onCommit={(v) => onUpdate({ is_ar: v })}
          onLabel="A/R"
          ariaLabel="Toggle accounts receivable"
        />
      </td>
      {!isIncome && (
        <td style={td()}>
          <AttachmentCell url={row.attachment_url} />
        </td>
      )}
      <td style={td()}>
        <RowMenu onDelete={onDelete} />
      </td>
    </tr>
  );
}

function DraftRow({
  draft,
  isIncome,
  onPatch,
  onDiscard,
  clientSuggestions,
  vendorSuggestions,
  categories,
}: {
  draft: Partial<NewFinanceTransaction>;
  isIncome: boolean;
  onPatch: (p: Partial<NewFinanceTransaction>) => void;
  onDiscard: () => void;
  clientSuggestions: string[];
  vendorSuggestions: string[];
  categories: FinanceCategory[];
}) {
  return (
    <tr style={{ background: "rgba(34,211,238,0.04)", borderBottom: "1px solid rgba(34,211,238,0.18)" }}>
      <td style={td()}>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard draft"
          className="text-muted-foreground hover:text-red-400"
          style={{ background: "transparent", border: 0, cursor: "pointer" }}
        >
          <X className="w-3 h-3" />
        </button>
      </td>
      <td style={td()}>
        {isIncome ? (
          <TextCell
            value={draft.client ?? ""}
            onCommit={(v) => onPatch({ client: v || null })}
            placeholder="Client (required)"
            ariaLabel="Draft client"
            suggestions={clientSuggestions}
          />
        ) : (
          <TextCell
            value={draft.vendor ?? ""}
            onCommit={(v) => onPatch({ vendor: v || null })}
            placeholder="Vendor (required)"
            ariaLabel="Draft vendor"
            suggestions={vendorSuggestions}
          />
        )}
      </td>
      {!isIncome && (
        <td style={td()}>
          <SelectCell
            value={(draft.category as FinanceCategory) ?? "Other"}
            options={categories}
            onCommit={(c) => onPatch({ category: c })}
            ariaLabel="Draft category"
          />
        </td>
      )}
      <td style={td()}>
        <DateCell value={draft.date ?? ""} onCommit={(d) => onPatch({ date: d })} ariaLabel="Draft date" />
      </td>
      <td style={td()}>
        <TextCell
          value={draft.description ?? ""}
          onCommit={(v) => onPatch({ description: v || null })}
          placeholder="Description"
          ariaLabel="Draft description"
          muted
        />
      </td>
      <td style={td()}>
        <NumberCell value={draft.amount ?? 0} onCommit={(n) => onPatch({ amount: n })} ariaLabel="Draft amount" />
      </td>
      <td style={td()}>
        <ToggleCell
          value={draft.is_ar ?? false}
          onCommit={(v) => onPatch({ is_ar: v })}
          onLabel="A/R"
          ariaLabel="Draft A/R toggle"
        />
      </td>
      {!isIncome && <td style={td()}>—</td>}
      <td style={td()} />
    </tr>
  );
}

function RowMenu({ onDelete }: { onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Row actions"
          style={{ background: "transparent", border: 0, cursor: "pointer", padding: 2 }}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { if (confirm("Delete this entry?")) onDelete(); }} className="text-red-400">
          <Trash2 className="w-3 h-3 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function td(): React.CSSProperties {
  return {
    padding: "6px 10px",
    verticalAlign: "middle",
    color: "#e2e8f0",
  };
}

function uniqueValues<T>(rows: T[], read: (r: T) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = read(r);
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
