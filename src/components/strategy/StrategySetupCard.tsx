// src/components/strategy/StrategySetupCard.tsx
//
// "Strategy setup" card on /clients/:id/strategy. Compresses what used to be
// four standalone sections (Content Mix, ManyChat & CTAs, Stories + Ads,
// Monetization) into a single 6-cell grid.
//
// Two edit modes:
//   1. Global edit (parent.editing=true) — every cell renders its fields
//      inline, writes go to the parent draft via setDraftField, parent's
//      Save button persists. Exactly how the old sections behaved.
//   2. Click-to-edit (parent.editing=false) — clicking a cell opens a
//      popover with just that cell's fields. Save persists immediately
//      (single atomic write via onPersistFields when provided, otherwise
//      one onPersistField call per field). Escape / outside-click / Cancel
//      closes without persisting. Only one popover open at a time.

import { useEffect, useState } from "react";

export interface StrategySetupFields {
  mix_reach: number;
  mix_trust: number;
  mix_convert: number;
  manychat_active: boolean;
  manychat_keyword: string;
  cta_goal: string;
  stories_per_week: number;
  ads_active: boolean;
  ads_budget: number;
  ads_goal: string;
  monthly_revenue_goal: number;
  monthly_revenue_actual: number;
  scripts_per_month: number;
  videos_edited_per_month: number;
  posts_per_month: number;
}

interface Props {
  s: StrategySetupFields;
  editing: boolean;
  en: boolean;
  onPersistField?: <K extends keyof StrategySetupFields>(field: K, value: StrategySetupFields[K]) => Promise<void>;
  /** Persist several fields in ONE write (preferred for multi-field cells). */
  onPersistFields?: (patch: Partial<StrategySetupFields>) => Promise<void>;
  setDraftField: (field: keyof StrategySetupFields, value: unknown) => void;
}

type CellId = "mix" | "manychat" | "stories" | "ads" | "revenue" | "targets";

const CELL_ORDER: CellId[] = ["mix", "manychat", "stories", "ads", "revenue", "targets"];

const CELL_FIELDS: Record<CellId, (keyof StrategySetupFields)[]> = {
  mix: ["mix_reach", "mix_trust", "mix_convert"],
  manychat: ["manychat_active", "manychat_keyword", "cta_goal"],
  stories: ["stories_per_week"],
  ads: ["ads_active", "ads_budget", "ads_goal"],
  revenue: ["monthly_revenue_goal", "monthly_revenue_actual"],
  targets: ["scripts_per_month", "videos_edited_per_month", "posts_per_month"],
};

const CELL_LABEL: Record<CellId, { en: string; es: string }> = {
  mix: { en: "Content mix", es: "Mezcla de contenido" },
  manychat: { en: "ManyChat", es: "ManyChat" },
  stories: { en: "Stories", es: "Historias" },
  ads: { en: "Ads", es: "Anuncios" },
  revenue: { en: "Revenue goal", es: "Meta de ingresos" },
  targets: { en: "Monthly targets", es: "Metas mensuales" },
};

type Getter = <K extends keyof StrategySetupFields>(f: K) => StrategySetupFields[K];
type Setter = (f: keyof StrategySetupFields, v: unknown) => void;

function NumField({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      className={className ?? "bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1 text-[12px] text-white outline-none focus:border-primary/60 w-16"}
    />
  );
}

function TextField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1.5 text-[12px] text-white outline-none focus:border-primary/60 w-full"
    />
  );
}

function ToggleField({ value, onChange, en }: { value: boolean; onChange: (v: boolean) => void; en: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!value); }}
      className="text-[11px] font-semibold px-3 py-1 rounded-md transition-colors"
      style={{
        background: value ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
        color: value ? "#22c55e" : "rgba(255,255,255,0.4)",
        border: value ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {value ? (en ? "Yes" : "Sí") : "No"}
    </button>
  );
}

export function StrategySetupCard({ s, editing, en, onPersistField, onPersistFields, setDraftField }: Props) {
  const [openCell, setOpenCell] = useState<CellId | null>(null);
  const [popDraft, setPopDraft] = useState<Partial<StrategySetupFields>>({});
  const [saving, setSaving] = useState(false);

  // Popovers are meaningless in global-edit mode (fields render inline
  // instead) — close any open popover if the parent flips into editing.
  useEffect(() => {
    if (editing) { setOpenCell(null); setPopDraft({}); }
  }, [editing]);

  useEffect(() => {
    if (!openCell) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenCell(null); setPopDraft({}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCell]);

  const openPopover = (id: CellId) => {
    const draft: Partial<StrategySetupFields> = {};
    for (const f of CELL_FIELDS[id]) (draft as Record<string, unknown>)[f] = s[f];
    setPopDraft(draft);
    setOpenCell(id);
  };

  const closePopover = () => { setOpenCell(null); setPopDraft({}); };

  const popGet: Getter = (f) => (f in popDraft ? popDraft[f] : s[f]) as never;
  const popSet: Setter = (field, value) => setPopDraft((prev) => ({ ...prev, [field]: value }));

  const savePopover = async () => {
    if (!openCell) return;
    setSaving(true);
    try {
      if (onPersistFields) {
        await onPersistFields(popDraft);
      } else if (onPersistField) {
        for (const f of CELL_FIELDS[openCell]) {
          if (f in popDraft) await onPersistField(f, popDraft[f] as never);
        }
      }
      closePopover();
    } finally {
      setSaving(false);
    }
  };

  const draftGet: Getter = (f) => s[f];

  function renderValue(id: CellId) {
    switch (id) {
      case "mix":
        return (
          <div>
            <div className="text-[12px] text-white/85">
              {en ? "Reach" : "Alcance"} {s.mix_reach} · {en ? "Trust" : "Confianza"} {s.mix_trust} · {en ? "Convert" : "Conversión"} {s.mix_convert}
            </div>
            <div className="flex h-1 rounded-full overflow-hidden gap-0.5 mt-2">
              <div style={{ width: `${s.mix_reach}%`, background: "hsl(var(--aqua))" }} />
              <div style={{ width: `${s.mix_trust}%`, background: "#F0BC7D" }} />
              <div style={{ width: `${s.mix_convert}%`, background: "#f59e0b" }} />
            </div>
          </div>
        );
      case "manychat":
        return (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.manychat_active ? "#22c55e" : "rgba(255,255,255,0.25)" }} />
            <span className="text-[12px]" style={{ color: s.manychat_active ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
              {s.manychat_active
                ? (s.manychat_keyword ? `${en ? "Active" : "Activo"} · "${s.manychat_keyword}"` : (en ? "Active" : "Activo"))
                : (en ? "Off" : "Apagado")}
            </span>
          </div>
        );
      case "stories":
        return (
          <div>
            <span className="text-lg font-black text-foreground">{s.stories_per_week}</span>
            <span className="text-xs font-normal text-white/25"> / {en ? "week" : "semana"}</span>
          </div>
        );
      case "ads":
        return (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.ads_active ? "#22c55e" : "rgba(255,255,255,0.25)" }} />
            <span className="text-[12px]" style={{ color: s.ads_active ? "#22c55e" : "rgba(255,255,255,0.4)" }}>
              {s.ads_active ? `${en ? "On" : "Activo"} · $${(s.ads_budget || 0).toLocaleString()}` : (en ? "Off" : "Apagado")}
            </span>
          </div>
        );
      case "revenue":
        return (
          <div>
            <div className="text-[12px] text-white/85">
              {s.monthly_revenue_goal > 0 ? `$${s.monthly_revenue_goal.toLocaleString()} / ${en ? "month" : "mes"}` : "—"}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5">
              {en ? "Actual" : "Real"}: ${s.monthly_revenue_actual.toLocaleString()}
            </div>
          </div>
        );
      case "targets":
        return (
          <div className="text-[12px] text-white/85">
            {s.scripts_per_month} {en ? "scripts" : "guiones"} · {s.videos_edited_per_month} {en ? "edits" : "ediciones"} · {s.posts_per_month} {en ? "posts" : "posts"}
          </div>
        );
    }
  }

  function renderFields(id: CellId, get: Getter, set: Setter) {
    switch (id) {
      case "mix":
        return (
          <div className="flex flex-col gap-2">
            {([
              { field: "mix_reach", label: en ? "Reach" : "Alcance", color: "hsl(var(--aqua))" },
              { field: "mix_trust", label: en ? "Trust" : "Confianza", color: "#F0BC7D" },
              { field: "mix_convert", label: en ? "Convert" : "Conversión", color: "#f59e0b" },
            ] as { field: keyof StrategySetupFields; label: string; color: string }[]).map((item) => (
              <div key={item.field} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] text-white/60">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  {item.label}
                </span>
                <NumField value={get(item.field) as number} onChange={(v) => set(item.field, v)} />
              </div>
            ))}
            <p className="text-[10px] text-white/25">{en ? "Percentages must add up to 100" : "Los porcentajes deben sumar 100"}</p>
          </div>
        );
      case "manychat":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-white/60">{en ? "ManyChat active" : "ManyChat activo"}</span>
              <ToggleField value={get("manychat_active") as boolean} onChange={(v) => set("manychat_active", v)} en={en} />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "Automation keyword" : "Palabra clave"}</div>
              <TextField value={get("manychat_keyword") as string} onChange={(v) => set("manychat_keyword", v)} />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "CTA goal" : "Objetivo del CTA"}</div>
              <TextField value={get("cta_goal") as string} onChange={(v) => set("cta_goal", v)} />
            </div>
          </div>
        );
      case "stories":
        return (
          <div>
            <div className="text-[11px] text-white/45 mb-1">{en ? "Target per week" : "Meta por semana"}</div>
            <NumField
              value={get("stories_per_week") as number}
              onChange={(v) => set("stories_per_week", v)}
              className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1.5 text-[13px] text-white outline-none focus:border-primary/60 w-24"
            />
          </div>
        );
      case "ads":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-white/60">{en ? "Running ads" : "Corriendo anuncios"}</span>
              <ToggleField value={get("ads_active") as boolean} onChange={(v) => set("ads_active", v)} en={en} />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "Monthly budget" : "Presupuesto mensual"}</div>
              <NumField
                value={get("ads_budget") as number}
                onChange={(v) => set("ads_budget", v)}
                className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1.5 text-[13px] text-white outline-none focus:border-primary/60 w-28"
              />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "Ads goal" : "Objetivo de anuncios"}</div>
              <TextField value={get("ads_goal") as string} onChange={(v) => set("ads_goal", v)} />
            </div>
          </div>
        );
      case "revenue":
        return (
          <div className="flex flex-col gap-2">
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "Monthly goal" : "Meta mensual"}</div>
              <NumField
                value={get("monthly_revenue_goal") as number}
                onChange={(v) => set("monthly_revenue_goal", v)}
                className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1.5 text-[13px] text-white outline-none focus:border-primary/60 w-28"
              />
            </div>
            <div>
              <div className="text-[11px] text-white/45 mb-1">{en ? "This month (actual)" : "Este mes (real)"}</div>
              <NumField
                value={get("monthly_revenue_actual") as number}
                onChange={(v) => set("monthly_revenue_actual", v)}
                className="bg-white/[0.06] border border-white/[0.12] rounded-lg px-2 py-1.5 text-[13px] text-white outline-none focus:border-primary/60 w-28"
              />
            </div>
          </div>
        );
      case "targets":
        return (
          <div className="flex flex-col gap-2">
            {([
              { field: "scripts_per_month", label: en ? "Scripts / month" : "Guiones / mes" },
              { field: "videos_edited_per_month", label: en ? "Videos edited / month" : "Videos editados / mes" },
              { field: "posts_per_month", label: en ? "Posts / month" : "Posts / mes" },
            ] as { field: keyof StrategySetupFields; label: string }[]).map((item) => (
              <div key={item.field} className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-white/60">{item.label}</span>
                <NumField value={get(item.field) as number} onChange={(v) => set(item.field, v)} />
              </div>
            ))}
          </div>
        );
    }
  }

  return (
    <section className="rounded-[14px] p-[18px_20px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <h3 className="text-[11px] font-bold tracking-[1.5px] uppercase mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
        {en ? "Strategy setup" : "Configuración de estrategia"}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {CELL_ORDER.map((id) => {
          const label = en ? CELL_LABEL[id].en : CELL_LABEL[id].es;

          if (editing) {
            return (
              <div key={id} className="rounded-lg p-3" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1.5">{label}</div>
                {renderFields(id, draftGet, (field, value) => setDraftField(field, value))}
              </div>
            );
          }

          const isOpen = openCell === id;
          return (
            <div
              key={id}
              tabIndex={0}
              role="button"
              aria-expanded={isOpen}
              onClick={() => openPopover(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPopover(id); }
              }}
              className="relative group rounded-lg p-3 cursor-pointer outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">{label}</span>
                <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: "hsl(var(--aqua))" }}>
                  ✎ {en ? "edit" : "editar"}
                </span>
              </div>
              {renderValue(id)}

              {isOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); closePopover(); }} />
                  <div
                    className="glass-card absolute left-0 top-full mt-2 z-20 w-72 max-w-[90vw] rounded-xl p-4"
                    style={{ border: "1px solid rgba(255,255,255,0.14)", background: "hsl(var(--graphite))" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderFields(id, popGet, popSet)}
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={closePopover}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-md text-white/50 hover:text-white/80 transition-colors"
                      >
                        {en ? "Cancel" : "Cancelar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { void savePopover(); }}
                        disabled={saving}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-md text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,hsl(var(--aqua)),hsl(var(--honey)))" }}
                      >
                        {saving ? (en ? "Saving…" : "Guardando…") : (en ? "Save" : "Guardar")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
