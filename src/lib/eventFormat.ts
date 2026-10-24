import type { Lang } from '@/types';

export interface Localized {
  en: string;
  hi: string;
}

export const bi = (en: string | null | undefined, hi: string | null | undefined, lang: Lang): string =>
  (lang === 'hi' ? hi || en : en || hi) || '';

export const pickL = (value: unknown, lang: Lang, fallback = ''): string => {
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<Localized>;
  return (lang === 'hi' ? v.hi || v.en : v.en || v.hi) || fallback;
};

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
};

const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
};

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00:00` : normalized;
  const date = new Date(withTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined, lang: Lang, withWeekday = false): string {
  const date = parseLocalDate(value);
  if (!date) return '—';
  const parts = [String(date.getDate()).padStart(2, '0'), MONTHS[lang][date.getMonth()], String(date.getFullYear())];
  if (withWeekday) parts.unshift(WEEKDAYS[lang][date.getDay()]);
  return parts.join(' ');
}

export function formatDateRange(start: string | null | undefined, end: string | null | undefined, lang: Lang): string {
  const a = parseLocalDate(start);
  const b = parseLocalDate(end);
  if (!a) return '—';
  if (!b || a.toDateString() === b.toDateString()) return formatDate(start, lang);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${String(a.getDate()).padStart(2, '0')}–${formatDate(end, lang)}`;
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${formatDate(start, lang)} – ${formatDate(end, lang)}`;
  }
  return `${formatDate(start, lang)} – ${formatDate(end, lang)}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '';
  const [hourRaw, minuteRaw] = value.split(':');
  const hour = Number(hourRaw);
  if (Number.isNaN(hour)) return '';
  const minute = String(Number(minuteRaw ?? 0)).padStart(2, '0');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = formatTime(start);
  const b = formatTime(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

export function dayParts(value: string | null | undefined): { day: string; month: string; weekday: string } {
  const date = parseLocalDate(value);
  if (!date) return { day: '—', month: '', weekday: '' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: MONTHS.en[date.getMonth()],
    weekday: WEEKDAYS.en[date.getDay()],
  };
}

export const seatTone = (left: number, capacity: number): 'plenty' | 'limited' | 'low' | 'out' => {
  if (left <= 0) return 'out';
  if (capacity <= 0) return 'plenty';
  const ratio = left / capacity;
  if (ratio <= 0.08) return 'low';
  if (ratio <= 0.3) return 'limited';
  return 'plenty';
};

export const seatLabel = (left: number): string => (left <= 0 ? 'Sold out' : `${left.toLocaleString('en-IN')} left`);
