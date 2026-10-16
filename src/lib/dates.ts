import type { Task } from './types';

export type Lang = 'pt' | 'en';

export const localeOf = (lang: Lang) => (lang === 'pt' ? 'pt-BR' : 'en-US');

/** Week starts on Sunday in English and Monday in Portuguese. */
export const weekStartOf = (lang: Lang): 0 | 1 => (lang === 'pt' ? 1 : 0);

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayStr = () => toDateStr(new Date());

/** YYYY-MM-DD → MM/DD/YYYY (en) or DD/MM/YYYY (pt). */
export function formatDate(s: string, lang: Lang): string {
  const [y, m, d] = s.split('-');
  return lang === 'pt' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

/** Parses the locale format back into YYYY-MM-DD, or null if invalid. */
export function parseLocalDate(text: string, lang: Lang): string | null {
  const m = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [day, month] = lang === 'pt' ? [a, b] : [b, a];
  const d = new Date(y, month - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toDateStr(d);
}

export function formatTime(t: string, lang: Lang): string {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(localeOf(lang), { hour: 'numeric', minute: '2-digit' });
}

/** HH:MM → "14:30" (pt) or "2:30 PM" (en), for the editable time field. */
export function formatTimeInput(t: string, lang: Lang): string {
  const [h, m] = t.split(':').map(Number);
  if (lang === 'pt') return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Parses a typed time into HH:MM, or null if invalid. Accepts 24 h ("9:05", "21:30") in both
 * languages and 12 h ("9:05 pm", "7 am") in English.
 */
export function parseLocalTime(text: string, lang: Lang): string | null {
  const m = text.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const suffix = m[3]?.replace(/\./g, '');
  if (min > 59) return null;
  if (suffix) {
    if (lang !== 'en' || h < 1 || h > 12) return null;
    h = (h % 12) + (suffix === 'pm' ? 12 : 0);
  } else if (m[2] === undefined || h > 23) {
    return null; // a bare "7" is ambiguous; require minutes in 24 h form
  }
  return `${pad(h)}:${pad(min)}`;
}

export function formatDue(task: Pick<Task, 'dueDate' | 'dueTime'>, lang: Lang): string {
  if (!task.dueDate) return '';
  return task.dueTime ? `${formatDate(task.dueDate, lang)} ${formatTime(task.dueTime, lang)}` : formatDate(task.dueDate, lang);
}

export function formatDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return `${formatDate(toDateStr(d), lang)} ${d.toLocaleTimeString(localeOf(lang), { hour: 'numeric', minute: '2-digit' })}`;
}

/** Overdue = has a due date in the past and is not Done. With a time, compares the exact moment. */
export function isOverdue(task: Task, now = new Date()): boolean {
  if (task.status === 'done' || !task.dueDate) return false;
  if (task.dueTime) {
    // Build the wall-clock moment directly (adding ms to midnight is off by 1h on DST days).
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const [h, mi] = task.dueTime.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi).getTime() < now.getTime();
  }
  return task.dueDate < toDateStr(now);
}

export function monthYearLabel(d: Date, lang: Lang): string {
  const s = d.toLocaleDateString(localeOf(lang), { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short weekday names in display order for the given language. */
export function weekdayNames(lang: Lang): string[] {
  const start = weekStartOf(lang);
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2023, 0, 1 + ((i + start) % 7)).toLocaleDateString(localeOf(lang), { weekday: 'short' }).replace('.', ''),
  );
}
