// src/components/strategy/ProductionPipelineSection.tsx
//
// "Production pipeline" section on /clients/:id/strategy. Urgency-sorted
// date rows (Done → schedule-next prompt) + ads_active toggle + ads_budget
// input + free-text notes. Anchored at #pipeline so the dashboard can
// deep-link here.
//
// Two edit modes:
//   1. Global edit (parent.editing=true) — every field renders as an input,
//      writes go to the parent draft, parent's Save button persists.
//   2. Inline edit (parent.editing=false) — click the calendar/edit button
//      (or "+ Set date" for unset rows) to edit just that one field. Enter
//      or blur persists immediately via onPersistField; Escape cancels.
//      ads_active flips on double-click.

import { useEffect, useRef, useState } from "react";
import {
  pipelineBucket,
  startOfDay,
  formatAbsolute,
  toInputValue,
  fromInputValue,
  nextSameWeekday,
  sortByUrgency,
  PIPELINE_BUCKET_COLOR,
} from "./pipelineDates";

export interface PipelineFields {
  onboarding_call_at: string | null;
  script_due_at:      string | null;
  editing_due_at:     string | null;
  next_filming_at:    string | null;
  boosting_at:        string | null;
  posting_at:         string | null;
  pipeline_notes:     string | null;
  pipeline_state:     Record<string, { done_at: string }>;
  ads_active:         boolean;
  ads_budget:         number;
}

interface Props {
  s: PipelineFields;
  editing: boolean;
  set: <K extends keyof PipelineFields>(field: K, value: PipelineFields[K]) => void;
  onPersistField?: <K extends keyof PipelineFields>(field: K, value: PipelineFields[K]) => Promise<void>;
  /** Persist several fields in ONE write. Required by the Done flow: two
   *  sequential onPersistField calls share a stale parent snapshot, so the
   *  second write would erase the first's pipeline_state update. */
  onPersistFields?: (patch: Partial<PipelineFields>) => Promise<void>;
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

// Hover affordance for double-clickable read-only fields. Subtle dashed
// underline that brightens on hover so users know the field is editable.
const editableSpanClass =
  "cursor-text border-b border-dashed border-white/0 hover:border-white/30 transition-colors select-none";

export function ProductionPipelineSection({ s, editing, set, onPersistField, onPersistFields, en }: Props) {
  // Tracks which row is currently in inline-edit mode (global editing=false).
  // value holds the in-progress input text so Escape can cancel cleanly.
  const [inline, setInline] = useState<
    | { field: keyof PipelineFields; value: string }
    | null
  >(null);

  // Which date row is showing the "Schedule next?" prompt after ✓ Done.
  const [prompting, setPrompting] = useState<keyof PipelineFields | null>(null);

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
      // A pick-date input opened from the "Schedule next?" prompt commits
      // via finishDone (persists pipeline_state too) instead of a bare set.
      if (prompting === row.field) {
        await finishDone(row.field, next);
      } else {
        const current = s[inline.field] as string | null;
        if (next !== current) await onPersistField(inline.field, next as never);
      }
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

  const doneMap = s.pipeline_state ?? {};

  const markDone = (field: keyof PipelineFields) => setPrompting(field);

  const finishDone = async (field: keyof PipelineFields, nextIso: string | null) => {
    const state = { ...doneMap, [field]: { done_at: new Date().toISOString() } };
    // Single write: nextIso null → field becomes unset. Two sequential
    // single-field persists would clobber each other (stale parent snapshot).
    await onPersistFields?.({ pipeline_state: state, [field]: nextIso } as Partial<PipelineFields>);
    setPrompting(null);
    setInline(null);
  };

  const dated = sortByUrgency(
    ROWS.map((r) => ({ ...r, iso: (s[r.field] as string | null) })),
  );

  const overdueCount = dated.filter(
    (r) => r.iso && pipelineBucket(r.iso, r.withTime) === 'overdue',
  ).length;

  return (
    <section id="pipeline" className="rounded-[14px] p-[18px_20px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[11px] font-bold tracking-[1.5px] uppercase" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {en ? 'Production pipeline' : 'Pipeline de producción'}
        </h3>
        {overdueCount > 0 && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
          >
            {overdueCount} {en ? 'overdue' : (overdueCount === 1 ? 'atrasado' : 'atrasados')}
          </span>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
          {ROWS.map((row) => {
            const value = s[row.field] as string | null;
            const inputType = row.withTime ? 'datetime-local' : 'date';
            return (
              <div key={row.field} className="flex items-center gap-3">
                <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {en ? row.labelEn : row.labelEs}
                </label>
                <input
                  type={inputType}
                  value={toInputValue(value, row.withTime)}
                  onChange={(e) => set(row.field, fromInputValue(e.target.value, row.withTime) as never)}
                  className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30"
                />
                {value && (
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
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {dated.map((row) => {
            const bucket = row.iso ? pipelineBucket(row.iso, row.withTime) : null;
            const dotColor = bucket ? PIPELINE_BUCKET_COLOR[bucket] : 'rgba(255,255,255,0.2)';
            const overdueDays = bucket === 'overdue'
              ? Math.max(1, Math.round((startOfDay(new Date()).getTime() - startOfDay(new Date(row.iso!)).getTime()) / 86_400_000))
              : 0;
            const isInline = inline?.field === row.field;
            const inputType = row.withTime ? 'datetime-local' : 'date';
            const label = en ? row.labelEn : row.labelEs;

            return (
              <div key={row.field} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                  <span className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {label}
                  </span>

                  {isInline ? (
                    <input
                      ref={inputRef}
                      type={inputType}
                      value={inline.value}
                      onChange={(e) => setInline({ field: row.field, value: e.target.value })}
                      onBlur={() => { void commitInline(); }}
                      onKeyDown={handleInlineKeyDown}
                      className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none focus:border-white/30"
                    />
                  ) : (
                    <>
                      <span
                        className="text-[12px]"
                        style={{ color: bucket === 'overdue' ? '#ef4444' : 'rgba(255,255,255,0.85)' }}
                      >
                        {row.iso ? formatAbsolute(row.iso, row.withTime) : (en ? '— unset' : '— sin fecha')}
                      </span>
                      {bucket === 'overdue' && (
                        <span className="text-[11px]" style={{ color: '#ef4444' }}>
                          {overdueDays}{en ? 'd overdue' : (overdueDays === 1 ? 'd atrasado' : 'd atrasados')}
                        </span>
                      )}

                      <span className="ml-auto flex items-center gap-2">
                        {row.iso && canInline && (
                          <button
                            type="button"
                            onClick={() => markDone(row.field)}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded"
                            style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
                          >
                            ✓ {en ? 'Done' : 'Hecho'}
                          </button>
                        )}
                        {canInline && (
                          row.iso ? (
                            <button
                              type="button"
                              onClick={() => setInline({ field: row.field, value: toInputValue(row.iso, row.withTime) })}
                              className="text-[11px] text-white/40 hover:text-white/70"
                              title={en ? 'Edit date' : 'Editar fecha'}
                            >
                              ✎
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setInline({ field: row.field, value: '' })}
                              className="text-[11px] text-white/40 hover:text-white/70 underline decoration-dashed"
                            >
                              + {en ? 'Set date' : 'Poner fecha'}
                            </button>
                          )
                        )}
                      </span>
                    </>
                  )}
                </div>

                {prompting === row.field && !isInline && (
                  <div className="ml-5 mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    <span>{en ? `Schedule next ${label}?` : `¿Programar próximo ${label}?`}</span>
                    <button
                      type="button"
                      onClick={() => { void finishDone(row.field, nextSameWeekday(row.iso!)); }}
                      className="px-2 py-0.5 rounded font-semibold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
                    >
                      {formatAbsolute(nextSameWeekday(row.iso!), row.withTime)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInline({ field: row.field, value: '' })}
                      className="underline decoration-dashed hover:text-white/80"
                    >
                      {en ? 'pick…' : 'elegir…'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void finishDone(row.field, null); }}
                      className="underline decoration-dashed hover:text-white/80"
                    >
                      {en ? 'skip' : 'omitir'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
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

      {Object.entries(doneMap).length > 0 && (
        <div className="mt-3 pt-2 border-t border-dashed border-white/10 text-[11px] text-white/30">
          {Object.entries(doneMap).map(([f, v]) => {
            const row = ROWS.find((r) => r.field === f);
            return row ? (
              <span key={f} className="mr-4">
                ✓ {en ? row.labelEn : row.labelEs} · {formatAbsolute(v.done_at, false)}
              </span>
            ) : null;
          })}
        </div>
      )}
    </section>
  );
}
