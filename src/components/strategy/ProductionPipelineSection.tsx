// src/components/strategy/ProductionPipelineSection.tsx
//
// "Production pipeline" section on /clients/:id/strategy. Urgency-sorted
// date rows (Done → schedule-next prompt) + ads_active toggle + ads_budget
// input + free-text notes. Anchored at #pipeline so the dashboard can
// deep-link here.
//
// Two edit modes:
//   1. Global edit (parent.editing=true) — every field renders as a
//      PipelineDatePopover trigger, writes go to the parent draft, parent's
//      Save button persists.
//   2. Inline edit (parent.editing=false) — date fields open a themed
//      PipelineDatePopover (click the ✎ button, or "+ Set date" for unset
//      rows) that persists immediately via onPersistField on Save.
//      ads_budget/pipeline_notes still use the native inline-input+blur
//      mechanism; ads_active flips on double-click.

import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  pipelineBucket,
  startOfDay,
  formatAbsolute,
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

const MINUTE_STEP_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// Themed replacement for native <input type="date"> / <input type="datetime-local">
// pickers, which render as a stark white browser control that clashes with the
// dark editorial UI. Wraps the shadcn Popover + the app's aqua-themed Calendar
// (see src/pages/EditingQueue.tsx for the established pattern) and, for
// `withTime` fields, adds a compact hour/minute/AM-PM row built from plain
// <select>s styled with theme tokens (no native <input type="time">, which
// pops the same white UI).
//
// Date/time edits are staged locally and only committed on Save, matching
// the "Changing date/time does NOT auto-save" requirement — callers get a
// single onSave(iso) / onClear() call.
function PipelineDatePopover({
  value,
  withTime,
  onSave,
  onClear,
  trigger,
  en,
}: {
  value: string | null;
  withTime: boolean;
  onSave: (iso: string) => void;
  onClear?: () => void;
  trigger: React.ReactNode;
  en: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [hour12, setHour12] = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  // Preserves an existing non-5-multiple minute (e.g. :41) so round-tripping
  // an untouched value doesn't silently snap it to the nearest :40/:45.
  const [extraMinute, setExtraMinute] = useState<number | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const initial = value ? new Date(value) : null;
      const validInitial = initial && !Number.isNaN(initial.getTime()) ? initial : null;
      setSelectedDay(validInitial);
      if (withTime) {
        if (validInitial) {
          const h = validInitial.getHours();
          const m = validInitial.getMinutes();
          setAmpm(h >= 12 ? 'PM' : 'AM');
          setHour12(((h + 11) % 12) + 1);
          setMinute(m);
          setExtraMinute(m % 5 !== 0 ? m : null);
        } else {
          setHour12(12);
          setMinute(0);
          setAmpm('PM');
          setExtraMinute(null);
        }
      }
    }
    setOpen(next);
  };

  const compose = (): Date | null => {
    if (!selectedDay) return null;
    const d = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate());
    if (withTime) {
      const h24 = (hour12 % 12) + (ampm === 'PM' ? 12 : 0);
      d.setHours(h24, minute, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    return d;
  };

  const handleSave = () => {
    const composed = compose();
    if (!composed) return;
    onSave(composed.toISOString());
    setOpen(false);
  };

  const handleClear = () => {
    onClear?.();
    setOpen(false);
  };

  const minuteOptions = extraMinute !== null && !MINUTE_STEP_OPTIONS.includes(extraMinute)
    ? [...MINUTE_STEP_OPTIONS, extraMinute].sort((a, b) => a - b)
    : MINUTE_STEP_OPTIONS;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarPicker
          mode="single"
          selected={selectedDay ?? undefined}
          onSelect={(day) => { if (day) setSelectedDay(day); }}
          initialFocus
        />
        {withTime && (
          <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
            <select
              aria-label={en ? 'Hour' : 'Hora'}
              value={hour12}
              onChange={(e) => setHour12(Number(e.target.value))}
              className="text-xs px-1.5 py-1 rounded-md border border-input bg-background text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">:</span>
            <select
              aria-label={en ? 'Minute' : 'Minuto'}
              value={minute}
              onChange={(e) => setMinute(Number(e.target.value))}
              className="text-xs px-1.5 py-1 rounded-md border border-input bg-background text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              {minuteOptions.map((m) => (
                <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 ml-1">
              {(['AM', 'PM'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={p}
                  onClick={() => setAmpm(p)}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                  style={ampm === p
                    ? { background: 'hsl(var(--aqua) / 0.15)', color: 'hsl(var(--aqua))', border: '1px solid hsl(var(--aqua) / 0.3)' }
                    : { background: 'transparent', color: 'hsl(var(--muted-foreground))', border: '1px solid transparent' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
          {value && onClear ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-destructive hover:underline"
            >
              {en ? 'Clear' : 'Quitar'}
            </button>
          ) : <span />}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              {en ? 'Cancel' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedDay}
              className="text-xs font-semibold px-3 py-1.5 rounded-md text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,hsl(var(--aqua)),hsl(var(--honey)))' }}
            >
              {en ? 'Save' : 'Guardar'}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  const canInline = !editing && !!onPersistField && !!onPersistFields;
  const inlineTitle = en ? 'Double-click to edit' : 'Doble clic para editar';

  // Persist the current inline-mode field, then exit inline mode. Used by
  // blur and Enter handlers — keeps the commit path single-sourced. Date
  // fields no longer flow through here — they persist via PipelineDatePopover's
  // own Save button — so this only handles ads_budget/pipeline_notes.
  const commitInline = async () => {
    if (!inline || !onPersistField) return;
    if (inline.field === 'ads_budget') {
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
    if (!onPersistFields) return;
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
            return (
              <div key={row.field} className="flex items-center gap-3">
                <label className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  {en ? row.labelEn : row.labelEs}
                </label>
                <PipelineDatePopover
                  value={value}
                  withTime={row.withTime}
                  onSave={(iso) => set(row.field, iso as never)}
                  onClear={() => set(row.field, null as never)}
                  en={en}
                  trigger={
                    <button
                      type="button"
                      className="text-[12px] px-2 py-1 rounded bg-white/5 border border-white/10 text-white outline-none hover:border-white/30 text-left min-w-[150px]"
                    >
                      {value ? formatAbsolute(value, row.withTime) : (en ? 'Set date…' : 'Poner fecha…')}
                    </button>
                  }
                />
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
            const label = en ? row.labelEn : row.labelEs;

            return (
              <div key={row.field} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                  <span className="text-[12px] w-[110px] shrink-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {label}
                  </span>

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
                        <PipelineDatePopover
                          value={row.iso}
                          withTime={row.withTime}
                          onSave={(iso) => { void onPersistField!(row.field, iso as never); }}
                          onClear={() => { void onPersistField!(row.field, null as never); }}
                          en={en}
                          trigger={
                            <button
                              type="button"
                              className="text-[11px] text-white/40 hover:text-white/70"
                              title={en ? 'Edit date' : 'Editar fecha'}
                            >
                              ✎
                            </button>
                          }
                        />
                      ) : (
                        <PipelineDatePopover
                          value={null}
                          withTime={row.withTime}
                          onSave={(iso) => { void onPersistField!(row.field, iso as never); }}
                          en={en}
                          trigger={
                            <button
                              type="button"
                              className="text-[11px] text-white/40 hover:text-white/70 underline decoration-dashed"
                            >
                              + {en ? 'Set date' : 'Poner fecha'}
                            </button>
                          }
                        />
                      )
                    )}
                  </span>
                </div>

                {prompting === row.field && (
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
                    <PipelineDatePopover
                      value={null}
                      withTime={row.withTime}
                      onSave={(iso) => { void finishDone(row.field, iso); }}
                      en={en}
                      trigger={
                        <button
                          type="button"
                          className="underline decoration-dashed hover:text-white/80"
                        >
                          {en ? 'pick…' : 'elegir…'}
                        </button>
                      }
                    />
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
