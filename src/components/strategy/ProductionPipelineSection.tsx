// src/components/strategy/ProductionPipelineSection.tsx
//
// "Production pipeline" section on /clients/:id/strategy. Six date inputs
// + ads_active toggle + ads_budget input + free-text notes. Anchored at
// #pipeline so the dashboard can deep-link here.
//
// Two edit modes:
//   1. Global edit (parent.editing=true) — every field renders as an input,
//      writes go to the parent draft, parent's Save button persists.
//   2. Inline edit (parent.editing=false) — double-click any field to edit
//      just that one. Blur or Enter persists immediately via onPersistField;
//      Escape cancels. ads_active flips on double-click.

import { useEffect, useRef, useState } from "react";

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
  onPersistField?: <K extends keyof PipelineFields>(field: K, value: PipelineFields[K]) => Promise<void>;
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

// Traffic-light coloring for pipeline dates, by how far away the date is:
//   red    → overdue (date already passed)
//   yellow → due within the next 7 days
//   green  → 7+ days away
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type PipelineBucket = 'overdue' | 'soon' | 'far';

const PIPELINE_BUCKET_COLOR: Record<PipelineBucket, string> = {
  overdue: '#ef4444', // red
  soon:    '#f59e0b', // amber/yellow
  far:     '#22c55e', // green
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** red = overdue, yellow = within 7 days, green = further out. Date-only
 *  fields compare at calendar-day granularity so "due today" isn't overdue. */
function pipelineBucket(iso: string, withTime: boolean, now: Date = new Date()): PipelineBucket {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'far';
  if (withTime) {
    if (d.getTime() < now.getTime()) return 'overdue';
    const days = (d.getTime() - now.getTime()) / 86_400_000;
    return days <= 7 ? 'soon' : 'far';
  }
  const dDay = startOfDay(d).getTime();
  const today = startOfDay(now).getTime();
  if (dDay < today) return 'overdue';
  const days = Math.round((dDay - today) / 86_400_000);
  return days <= 7 ? 'soon' : 'far';
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`;
  return `${h12}${mm}${period}`;
}

/** Absolute date label, e.g. "Mon Jun 14" — adds time for timed fields
 *  that carry a non-midnight time, e.g. "Mon Jun 14, 5:17pm". */
function formatAbsolute(iso: string, withTime: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const base = `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return withTime && hasTime ? `${base}, ${formatTime(d)}` : base;
}

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
  const d = withTime ? new Date(v) : new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Hover affordance for double-clickable read-only fields. Subtle dashed
// underline that brightens on hover so users know the field is editable.
const editableSpanClass =
  "cursor-text border-b border-dashed border-white/0 hover:border-white/30 transition-colors select-none";

export function ProductionPipelineSection({ s, editing, set, onPersistField, en }: Props) {
  // Tracks which row is currently in inline-edit mode (global editing=false).
  // value holds the in-progress input text so Escape can cancel cleanly.
  const [inline, setInline] = useState<
    | { field: keyof PipelineFields; value: string }
    | null
  >(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the relevant control as soon as inline mode activates.
  useEffect(() => {
    if (!inline) return;
    if (inline.field === 'pipeline_notes') {
      textareaRef.current?.focus();
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [inline]);

  const canInline = !editing && !!onPersistField;
  const inlineTitle = en ? 'Double-click to edit' : 'Doble clic para editar';

  // Persist the current inline-mode field, then exit inline mode. Used by
  // blur and Enter handlers — keeps the commit path single-sourced.
  const commitInline = async () => {
    if (!inline || !onPersistField) return;
    const row = ROWS.find((r) => r.field === inline.field);
    if (row) {
      const next = fromInputValue(inline.value, row.withTime);
      const current = s[inline.field] as string | null;
      if (next !== current) await onPersistField(inline.field, next as never);
    } else if (inline.field === 'ads_budget') {
      const num = Number(inline.value);
      const next = Number.isFinite(num) ? Math.max(0, num) : 0;
      if (next !== s.ads_budget) await onPersistField('ads_budget', next as never);
    } else if (inline.field === 'pipeline_notes') {
      const next = inline.value.trim() ? inline.value : null;
      if (next !== s.pipeline_notes) await onPersistField('pipeline_notes', next as never);
    }
    setInline(null);
  };

  const cancelInline = () => setInline(null);

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelInline();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      (e.target as HTMLElement).blur(); // triggers commitInline via onBlur
    }
  };

  return (
    <section id="pipeline" className="rounded-[14px] p-[18px_20px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 className="text-[11px] font-bold tracking-[1.5px] uppercase mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {en ? 'Production pipeline' : 'Pipeline de producción'}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {ROWS.map((row) => {
          const value = s[row.field] as string | null;
          const bucket = value ? pipelineBucket(value, row.withTime) : null;
          const inputType = row.withTime ? 'datetime-local' : 'date';
          const isInline = inline?.field === row.field;
          const showInput = editing || isInline;
          return (
            <div key={row.field} className="flex items-center gap-3">
              <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {en ? row.labelEn : row.labelEs}
              </label>
              {showInput ? (
                <input
                  ref={isInline ? inputRef : undefined}
                  type={inputType}
                  value={isInline ? inline.value : toInputValue(value, row.withTime)}
                  onChange={(e) => {
                    if (isInline) setInline({ field: row.field, value: e.target.value });
                    else set(row.field, fromInputValue(e.target.value, row.withTime) as never);
                  }}
                  onBlur={isInline ? () => { void commitInline(); } : undefined}
                  onKeyDown={isInline ? handleInlineKeyDown : undefined}
                  className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30"
                />
              ) : (
                <span
                  className={canInline ? editableSpanClass : undefined}
                  style={{
                    color: bucket ? PIPELINE_BUCKET_COLOR[bucket] : 'rgba(255,255,255,0.35)',
                    fontSize: 12,
                  }}
                  title={canInline ? inlineTitle : undefined}
                  onDoubleClick={canInline ? () => setInline({ field: row.field, value: toInputValue(value, row.withTime) }) : undefined}
                >
                  {value ? formatAbsolute(value, row.withTime) : '—'}
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
            <span
              className={canInline ? editableSpanClass : undefined}
              style={{ color: s.ads_active ? '#22c55e' : 'rgba(255,255,255,0.45)', fontSize: 12 }}
              title={canInline ? inlineTitle : undefined}
              onDoubleClick={canInline ? () => { void onPersistField!('ads_active', !s.ads_active as never); } : undefined}
            >
              {s.ads_active ? (en ? 'Yes' : 'Sí') : 'No'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {en ? 'Ads budget' : 'Presupuesto'}
          </label>
          {(() => {
            const isInline = inline?.field === 'ads_budget';
            const showInput = editing || isInline;
            if (showInput) {
              return (
                <input
                  ref={isInline ? inputRef : undefined}
                  type="number"
                  min={0}
                  value={isInline ? inline.value : String(s.ads_budget ?? 0)}
                  onChange={(e) => {
                    if (isInline) setInline({ field: 'ads_budget', value: e.target.value });
                    else set('ads_budget', (Number(e.target.value) || 0) as never);
                  }}
                  onBlur={isInline ? () => { void commitInline(); } : undefined}
                  onKeyDown={isInline ? handleInlineKeyDown : undefined}
                  className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 w-[100px]"
                />
              );
            }
            return (
              <span
                className={canInline ? editableSpanClass : undefined}
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}
                title={canInline ? inlineTitle : undefined}
                onDoubleClick={canInline ? () => setInline({ field: 'ads_budget', value: String(s.ads_budget ?? 0) }) : undefined}
              >
                {s.ads_budget > 0 ? `$${s.ads_budget}` : '—'}
              </span>
            );
          })()}
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-[1px] block mb-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {en ? 'Notes' : 'Notas'}
        </label>
        {(() => {
          const isInline = inline?.field === 'pipeline_notes';
          const showInput = editing || isInline;
          if (showInput) {
            return (
              <textarea
                ref={isInline ? textareaRef : undefined}
                rows={3}
                value={isInline ? inline.value : (s.pipeline_notes ?? '')}
                onChange={(e) => {
                  if (isInline) setInline({ field: 'pipeline_notes', value: e.target.value });
                  else set('pipeline_notes', (e.target.value || null) as never);
                }}
                onBlur={isInline ? () => { void commitInline(); } : undefined}
                onKeyDown={isInline ? handleInlineKeyDown : undefined}
                placeholder={en ? 'Status, blockers, context…' : 'Estado, bloqueadores, contexto…'}
                className="w-full text-[12px] p-2 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 resize-y"
              />
            );
          }
          return (
            <p
              className={`text-[12px] whitespace-pre-wrap ${canInline ? editableSpanClass : ''}`}
              style={{ color: s.pipeline_notes ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}
              title={canInline ? inlineTitle : undefined}
              onDoubleClick={canInline ? () => setInline({ field: 'pipeline_notes', value: s.pipeline_notes ?? '' }) : undefined}
            >
              {s.pipeline_notes || (en ? 'No notes' : 'Sin notas')}
            </p>
          );
        })()}
      </div>
    </section>
  );
}
