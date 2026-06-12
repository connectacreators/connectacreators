// src/lib/triage/relativeDate.ts
//
// Format a timestamp relative to "now" for the triage view.
//   Past         → "Overdue"
//   < 60 minutes → "In Nm"
//   Today        → "Today HH:MM"  (or "Today" if no time component / midnight)
//   Tomorrow     → "Tomorrow"     (or "Tomorrow HH:MM" with explicit time)
//   2..6 days    → weekday name   ("Fri", "Mon")
//   ≤ 14 days    → "In N days"
//   > 14 days    → absolute date  ("Jun 10")

import type { Language } from "@/hooks/useLanguage";

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function hasTimeOfDay(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  const mm = m === 0 ? '' : `:${m.toString().padStart(2, '0')}`;
  return `${h12}${mm}${period}`;
}

export type RelativeBucket = 'overdue' | 'soon' | 'today' | 'tomorrow' | 'thisweek' | 'twoweeks' | 'farfuture';

export interface RelativeDate {
  label: string;       // user-facing string
  bucket: RelativeBucket;
}

export function relativeDate(iso: string, now: Date = new Date(), lang: Language = 'en'): RelativeDate {
  const es = lang === 'es';
  const d = new Date(iso);
  const diffMs = d.getTime() - now.getTime();

  if (diffMs < 0) return { label: es ? 'Atrasado' : 'Overdue', bucket: 'overdue' };

  const diffMin = diffMs / 60000;
  if (diffMin < 60) return { label: `${es ? 'En' : 'In'} ${Math.max(1, Math.round(diffMin))}m`, bucket: 'soon' };

  if (isSameLocalDay(d, now)) {
    const today = es ? 'Hoy' : 'Today';
    return { label: hasTimeOfDay(d) ? `${today} ${formatTime(d)}` : today, bucket: 'today' };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameLocalDay(d, tomorrow)) {
    const tmw = es ? 'Mañana' : 'Tomorrow';
    return { label: hasTimeOfDay(d) ? `${tmw} ${formatTime(d)}` : tmw, bucket: 'tomorrow' };
  }

  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays >= 2 && diffDays <= 6) return { label: (es ? WEEKDAYS_ES : WEEKDAYS)[d.getDay()], bucket: 'thisweek' };
  if (diffDays <= 14) return { label: es ? `En ${diffDays} días` : `In ${diffDays} days`, bucket: 'twoweeks' };

  return { label: `${(es ? MONTHS_ES : MONTHS)[d.getMonth()]} ${d.getDate()}`, bucket: 'farfuture' };
}

export function isWithinDays(iso: string, days: number, now: Date = new Date()): boolean {
  const t = new Date(iso).getTime();
  const cutoff = now.getTime() + days * 24 * 60 * 60 * 1000;
  return t >= now.getTime() && t <= cutoff;
}
