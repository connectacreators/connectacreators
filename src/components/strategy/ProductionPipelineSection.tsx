// src/components/strategy/ProductionPipelineSection.tsx
//
// "Production pipeline" section on /clients/:id/strategy. Six date inputs
// + ads_active toggle + ads_budget input + free-text notes. Anchored at
// #pipeline so the dashboard can deep-link here.
//
// Read/write contract: receives `s` (the current strategy snapshot) and
// `set(field, value)` (the existing helper from ClientStrategy.tsx that
// updates the draft). Does NOT perform saves — parent's Save button writes
// the whole strategy via upsert.

import { relativeDate, type RelativeBucket } from "@/lib/triage/relativeDate";

export interface PipelineFields {
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  pipeline_notes:     string | null;
  ads_active:         boolean;
  ads_budget:         number;
}

interface Props {
  s: PipelineFields;
  editing: boolean;
  set: <K extends keyof PipelineFields>(field: K, value: PipelineFields[K]) => void;
  en: boolean;
}

const ROWS: Array<{ field: keyof PipelineFields; labelEn: string; labelEs: string; withTime: boolean }> = [
  { field: 'onboarding_call_at', labelEn: 'Onboarding call', labelEs: 'Llamada de onboarding', withTime: true  },
  { field: 'script_due_at',      labelEn: 'Script due',      labelEs: 'Guion debido',           withTime: false },
  { field: 'editing_due_at',     labelEn: 'Editing due',     labelEs: 'Edición debida',         withTime: false },
  { field: 'next_filming_at',    labelEn: 'Next filming',    labelEs: 'Próxima grabación',      withTime: true  },
  { field: 'boosting_at',        labelEn: 'Boosting',        labelEs: 'Boosting',               withTime: false },
  { field: 'posting_at',         labelEn: 'Posting',         labelEs: 'Publicación',            withTime: false },
];

const BUCKET_COLOR: Record<RelativeBucket, string> = {
  overdue:   '#ef4444',
  soon:      '#f59e0b',
  today:     '#f59e0b',
  tomorrow:  '#f59e0b',
  thisweek:  'rgba(255,255,255,0.55)',
  twoweeks:  'rgba(255,255,255,0.45)',
  farfuture: 'rgba(255,255,255,0.40)',
};

/** Convert a `timestamptz` string to the `<input type="datetime-local">` / `date` value. */
function toInputValue(iso: string | null, withTime: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!withTime) return date;
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert an input value back to ISO; empty → null. */
function fromInputValue(v: string, withTime: boolean): string | null {
  if (!v) return null;
  // Treat as local time; build a Date then return its ISO.
  const d = withTime ? new Date(v) : new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ProductionPipelineSection({ s, editing, set, en }: Props) {
  return (
    <section id="pipeline" className="rounded-[14px] p-[18px_20px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 className="text-[11px] font-bold tracking-[1.5px] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {en ? 'Production pipeline' : 'Pipeline de producción'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {ROWS.map((row) => {
          const value = s[row.field] as string | null;
          const rel = value ? relativeDate(value) : null;
          const inputType = row.withTime ? 'datetime-local' : 'date';
          return (
            <div key={row.field} className="flex items-center gap-3">
              <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {en ? row.labelEn : row.labelEs}
              </label>
              {editing ? (
                <input
                  type={inputType}
                  value={toInputValue(value, row.withTime)}
                  onChange={(e) => set(row.field, fromInputValue(e.target.value, row.withTime) as never)}
                  className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30"
                />
              ) : (
                <span className="text-[12px]" style={{ color: rel ? BUCKET_COLOR[rel.bucket] : 'rgba(255,255,255,0.35)' }}>
                  {rel ? rel.label : (en ? '—' : '—')}
                </span>
              )}
              {editing && value && (
                <button
                  type="button"
                  onClick={() => set(row.field, null as never)}
                  className="text-[11px] text-white/40 hover:text-white/70"
                >
                  {en ? 'Clear' : 'Borrar'}
                </button>
              )}
              {!editing && rel && (
                <span className="text-[11px]" style={{ color: BUCKET_COLOR[rel.bucket] }}>
                  ({rel.label})
                </span>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {en ? 'Ads active' : 'Anuncios activos'}
          </label>
          {editing ? (
            <button
              type="button"
              onClick={() => set('ads_active', !s.ads_active)}
              className="text-[11px] font-semibold px-3 py-1 rounded-md"
              style={{
                background: s.ads_active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                color: s.ads_active ? '#22c55e' : 'rgba(255,255,255,0.4)',
                border: s.ads_active ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {s.ads_active ? (en ? 'Yes' : 'Sí') : 'No'}
            </button>
          ) : (
            <span className="text-[12px]" style={{ color: s.ads_active ? '#22c55e' : 'rgba(255,255,255,0.45)' }}>
              {s.ads_active ? (en ? 'Yes' : 'Sí') : 'No'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {en ? 'Ads budget' : 'Presupuesto'}
          </label>
          {editing ? (
            <input
              type="number"
              min={0}
              value={s.ads_budget ?? 0}
              onChange={(e) => set('ads_budget', Number(e.target.value) || 0)}
              className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 w-[100px]"
            />
          ) : (
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {s.ads_budget > 0 ? `$${s.ads_budget}` : '—'}
            </span>
          )}
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-[1px] block mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {en ? 'Notes' : 'Notas'}
        </label>
        {editing ? (
          <textarea
            rows={3}
            value={s.pipeline_notes ?? ''}
            onChange={(e) => set('pipeline_notes', e.target.value || null)}
            placeholder={en ? 'Status, blockers, context…' : 'Estado, bloqueadores, contexto…'}
            className="w-full text-[12px] p-2 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 resize-y"
          />
        ) : (
          <p className="text-[12px] whitespace-pre-wrap" style={{ color: s.pipeline_notes ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
            {s.pipeline_notes || (en ? 'No notes' : 'Sin notas')}
          </p>
        )}
      </div>
    </section>
  );
}
