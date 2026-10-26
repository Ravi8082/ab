import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  Hash,
  Loader2,
  MapPin,
  QrCode,
  ScanLine,
  Search,
  ShieldAlert,
  Ticket,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { AdminApiError, type CheckInResult } from '@/lib/adminApi';
import { formatRupees } from '@/lib/pricing';
import { formatTimeRange } from '@/lib/eventFormat';
import { formatDateTime, formatDay } from '@/components/admin/ui';

type BlockedInfo = {
  reference: string;
  name: string;
  guestCategory: string;
  ticketName?: string;
  reason: string;
  blockedBy: string | null;
};

type DenialCode =
  | 'not_paid'
  | 'not_started'
  | 'expired'
  | 'entries_exhausted'
  | 'already_scanned'
  | 'live_code_invalid'
  | 'live_code_used'
  | 'live_code_expired'
  | 'static_disabled'
  | 'unknown_attendee'
  | 'unknown';

type DenialInfo = {
  reference: string;
  name: string;
  guestCategory: string;
  code: DenialCode;
  status?: string;
  source?: string;
  qty?: number;
  amount?: number;
  passDays?: number;
  validFrom?: string;
  validTo?: string;
  expiredOn?: string;
  entriesAllowed?: number;
  entriesUsed?: number;
  entriesLeft?: number;
  entriesToday?: number;
  entriesTodayAllowed?: number;
  entriesTodayLeft?: number;
  daysUsed?: number;
  daysAllowed?: number;
  lastEntryDate?: string;
  lastEntryAt?: string;
  lastGate?: string | null;
  lastStaff?: string | null;
  otherGate?: boolean;
  ticketName?: string;
  eventName?: string;
  endTime?: string;
};

type Feedback =
  | { kind: 'success'; result: CheckInResult }
  | { kind: 'blocked'; blocked: BlockedInfo; message: string }
  | { kind: 'denied'; denied: DenialInfo; message: string }
  | { kind: 'error'; message: string; notFound?: boolean };

const DEDUPE_MS = 4000;

const DENIED_COPY: Record<DenialCode, { en: string; hi: string; note: string }> = {
  already_scanned: {
    en: 'All seats used today',
    hi: 'आज की सभी सीटें उपयोग हो चुकी हैं',
    note: 'Every attendee on this booking has already entered today. Do not let anyone else in on this QR today.',
  },
  entries_exhausted: {
    en: 'All event days used',
    hi: 'सभी आयोजन दिन उपयोग हो चुके हैं',
    note: 'Every event day covered by this pass is finished. Send the devotee to the help desk if they need another pass.',
  },
  expired: {
    en: 'Pass expired',
    hi: 'पास की समय-सीमा समाप्त',
    note: 'The event days covered by this pass are over. Entry is closed.',
  },
  not_started: {
    en: 'Entry not open yet',
    hi: 'प्रवेश अभी शुरू नहीं हुआ',
    note: 'This pass becomes valid on a later date. Do not allow entry before the event day.',
  },
  not_paid: {
    en: 'Payment pending',
    hi: 'भुगतान बाकी है',
    note: 'This booking is not paid, or it was cancelled or refunded. Entry is not allowed.',
  },
  live_code_invalid: {
    en: 'Live QR not recognised',
    hi: 'लाइव QR मान्य नहीं',
    note: 'Ask the devotee to refresh the pass screen and show the code that appears now.',
  },
  live_code_used: {
    en: 'Live QR already used',
    hi: 'लाइव QR पहले उपयोग हो चुका',
    note: 'A live code works once and lasts 60 seconds. A screenshot cannot be reused — ask for the code on screen right now.',
  },
  live_code_expired: {
    en: 'Live QR expired',
    hi: 'लाइव QR की समय-सीमा खत्म',
    note: 'Each live code lasts 60 seconds. Ask the devotee to refresh the pass screen for a new code.',
  },
  static_disabled: {
    en: 'Use the live QR',
    hi: 'लाइव QR दिखाएँ',
    note: 'Printed and static QR passes are switched off. Ask the devotee to open the pass and show the rotating QR.',
  },
  unknown_attendee: {
    en: 'Name not on this pass',
    hi: 'यह नाम इस पास पर नहीं है',
    note: 'This booking does not carry that attendee number. Tick only the names listed on the pass.',
  },
  unknown: {
    en: 'Not allowed',
    hi: 'प्रवेश नहीं',
    note: 'This pass cannot be accepted at the gate. Check the code or search the booking in the admin panel.',
  },
};

/** Bilingual identity chip — the gate must know whose pass this is before letting them in. */
const GUEST_BADGE: Record<string, { en: string; hi: string; tone: string }> = {
  visitor: { en: 'Visitor', hi: 'दर्शक', tone: 'bg-emerald-600/25 text-emerald-50 border-emerald-200/40' },
  vip: { en: 'VIP guest', hi: 'विपि अतिथि', tone: 'bg-amber-400/25 text-amber-50 border-amber-200/50' },
  press: { en: 'Press', hi: 'प्रेस', tone: 'bg-sky/25 text-sky-50 border-sky-200/40' },
  organiser: { en: 'Organiser', hi: 'आयोजक', tone: 'bg-white/20 text-white border-white/40' },
  staff: { en: 'Gate staff', hi: 'स्टाफ़', tone: 'bg-white/20 text-white border-white/40' },
  other: { en: 'Other guest', hi: 'अन्य अतिथि', tone: 'bg-white/15 text-white/90 border-white/30' },
};

function guestBadge(category?: string) {
  return GUEST_BADGE[String(category || 'visitor')] ?? GUEST_BADGE.visitor;
}

function passLength(days?: number) {
  if (!days) return '';
  return days === 1 ? '1-day pass' : `${days}-day pass`;
}

/** "5:11 PM" from a MySQL datetime or a plain HH:MM:SS time. */
function timeOnly(value?: string | null) {
  const raw = String(value || '');
  const hhmm = raw.includes(' ') ? raw.slice(11, 16) : raw.slice(0, 5);
  if (!/^\d{1,2}:\d{2}/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function scheduleLabel(result: CheckInResult) {
  const { event_date, end_date, start_time, end_time } = result.schedule;
  const dates =
    end_date && end_date !== event_date ? `${formatDay(event_date)} – ${formatDay(end_date)}` : formatDay(event_date);
  const times = formatTimeRange(start_time, end_time);
  return times ? `${dates} · ${times}` : dates;
}

function LightChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 font-ui text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-white/90">
      {children}
    </span>
  );
}

function GuestChip({ category, passName }: { category?: string; passName?: string }) {
  const badge = guestBadge(category);
  // Every online booking carries guest_category 'visitor', so the identity word only means
  // something when admin marked it VIP/press/staff — otherwise name the ticket actually bought.
  const named = !passName || (category && category !== 'visitor');
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-ui text-[0.6rem] font-semibold uppercase tracking-[0.14em] ${badge.tone}`}
    >
      {named ? `${badge.en} · ${badge.hi}` : passName}
    </span>
  );
}

function Fact({
  icon,
  label,
  value,
  sub,
  tone = 'good',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={`mt-0.5 shrink-0 ${tone === 'bad' ? 'text-red-700' : 'text-emerald-700'}`}>{icon}</span>
      <div className="min-w-0">
        <p className="font-ui text-[0.58rem] uppercase tracking-[0.14em] text-muted">{label}</p>
        <p className="truncate text-sm text-ink">{value}</p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
    </div>
  );
}

function SuccessBody({
  result,
  picked,
  canAdmit,
  busy,
  error,
  onToggle,
  onPickAll,
  onAdmit,
}: {
  result: CheckInResult;
  picked: number[];
  canAdmit: boolean;
  busy: boolean;
  error: string;
  onToggle: (position: number) => void;
  onPickAll: () => void;
  onAdmit: () => void;
}) {
  const entries = result.checkIn;
  const length = passLength(result.passDays ?? entries.entriesAllowed);
  const validTo = result.validTo ?? result.schedule.end_date ?? result.schedule.event_date;
  const close = timeOnly(result.schedule.end_time);
  const roster = result.attendees ?? [];
  const openNames = roster.filter((att) => !att.enteredToday);
  const seatsLeft = Math.max(0, entries.entriesTodayLeft ?? 0);

  return (
    <div>
      <div className="flex items-start gap-3 bg-emerald-600 px-4 py-4 text-white">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 330, damping: 17 }}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 ring-2 ring-white/40"
        >
          <CheckCircle2 size={34} strokeWidth={2.5} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="font-ui text-[0.62rem] uppercase tracking-[0.18em] text-emerald-100/90">
            Entry allowed · प्रवेश दें
          </p>
          <p className="truncate font-display text-xl leading-tight">{result.name}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <GuestChip category={result.guestCategory} passName={result.ticket?.name_en} />
            {length && <LightChip>{length}</LightChip>}
            {result.qty > 1 && (
              <LightChip>
                {result.qty} seats · {result.qty} सीटें
              </LightChip>
            )}
            {result.gate && <LightChip>{result.gate}</LightChip>}
            {result.source === 'admin_free' && <LightChip>Free issue · निःशुल्क</LightChip>}
            {result.offline && <LightChip>Offline · syncs later</LightChip>}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 font-mono text-xs tracking-[0.08em]">
          {result.reference}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[0.72rem] font-semibold text-emerald-800">
          <Clock3 size={14} />
          Valid till {formatDay(validTo)}
          {close ? ` · gate closes ${close}` : ''}
        </p>

        {entries.seats > 1 && (
          <p
            className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-[0.72rem] font-semibold leading-relaxed ${
              entries.entriesTodayLeft > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {entries.entriesTodayLeft > 0 ? (
              <>
                <Users size={14} className="mt-0.5 shrink-0" />
                <span>
                  {entries.entriesTodayLeft} more {entries.entriesTodayLeft === 1 ? 'seat' : 'seats'} from this booking
                  can still enter today · इस बुकिंग की {entries.entriesTodayLeft}{' '}
                  {entries.entriesTodayLeft === 1 ? 'सीट आज और प्रवेश कर सकती है' : 'सीटें आज और प्रवेश कर सकती हैं'}।
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span>
                  All {entries.entriesTodayAllowed} seats have entered today · आज की सभी सीटों का प्रवेश हो गया।
                </span>
              </>
            )}
          </p>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact
            icon={<Ticket size={15} />}
            label="Ticket bought"
            value={result.ticket.name_en}
            sub={`${result.event.name_en}${length ? ` · ${length}` : ''}`}
          />
          <Fact icon={<CalendarDays size={15} />} label="Event day" value={scheduleLabel(result)} />
          <Fact
            icon={<Users size={15} />}
            label="Attendees"
            value={`${result.qty} ${result.qty === 1 ? 'person' : 'people'} · ${
              result.amount === 0 ? 'Free pass' : `${formatRupees(result.amount)} paid`
            }`}
            sub={`${result.email} · ${result.phone}`}
          />
          <Fact
            icon={<Users size={15} />}
            label="Entry today"
            value={
              entries.seats > 1
                ? `${entries.entriesToday} of ${entries.entriesTodayAllowed} seats entered`
                : '1 seat entered'
            }
            sub={
              entries.seats > 1
                ? `${entries.entriesTodayLeft} ${
                    entries.entriesTodayLeft === 1 ? 'seat' : 'seats'
                  } still open today · ${formatDateTime(result.checkedInAt)}`
                : formatDateTime(result.checkedInAt)
            }
          />
          <Fact
            icon={<Clock3 size={15} />}
            label="Pass usage"
            value={`${entries.daysUsed} of ${entries.daysAllowed} event ${
              entries.daysAllowed === 1 ? 'day' : 'days'
            } used`}
            sub={`${entries.entriesUsed} of ${entries.entriesAllowed} total entries · event day ${entries.dayNumber} of ${entries.calendarDays}`}
          />
        </dl>

        {roster.length > 1 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-ui text-[0.58rem] uppercase tracking-[0.14em] text-emerald-800">
                Names on this pass · कौन अंदर जा रहा है
              </p>
              {canAdmit && openNames.length > 0 && (
                <button
                  type="button"
                  onClick={onPickAll}
                  className="rounded-lg px-2 py-1 font-ui text-[0.66rem] font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:bg-emerald-100"
                >
                  Tick all {openNames.length} still outside
                </button>
              )}
            </div>

            <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
              {roster.map((att) => {
                const entered = Boolean(att.enteredToday);
                const checked = entered || picked.includes(att.position);
                return (
                  <li key={att.position}>
                    <label
                      className={`flex items-start gap-2 rounded-lg px-1.5 py-1 text-xs transition-colors ${
                        entered ? 'cursor-default bg-emerald-100/80' : canAdmit ? 'cursor-pointer hover:bg-white' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                        checked={checked}
                        disabled={entered || !canAdmit}
                        onChange={() => onToggle(att.position)}
                        aria-label={`Let ${att.name} in now`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {att.position}. {att.name}
                        </span>
                        <span className="block truncate text-[0.68rem] text-muted">
                          {att.phone}
                          {entered && ' · entered · अंदर'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/70 pt-2.5">
              <p className="text-[0.72rem] font-semibold text-emerald-900">
                {picked.length > 0
                  ? `${picked.length} going in now · ${picked.length} लोग अभी अंदर`
                  : `${openNames.length} still outside today · ${seatsLeft} ${
                      seatsLeft === 1 ? 'seat' : 'seats'
                    } open today`}
              </p>
              {canAdmit && (
                <button
                  type="button"
                  onClick={onAdmit}
                  disabled={busy || picked.length === 0 || picked.length > seatsLeft}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 font-ui text-xs font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  {busy ? 'Admitting…' : `Let ${picked.length || 0} in · प्रवेश दें`}
                </button>
              )}
            </div>

            {!canAdmit && (
              <p className="mt-1.5 text-[0.68rem] text-emerald-900/80">
                Ticks show who has already entered. Group entry by name needs a live connection · नाम से प्रवेश के लिए
                इंटरनेट चाहिए.
              </p>
            )}
            {error && <p className="mt-1.5 text-[0.7rem] font-semibold text-red-700">{error}</p>}
          </div>
        )}

        <p className="flex items-start gap-2 text-[0.7rem] text-muted">
          <MapPin size={13} className="mt-0.5 shrink-0" />
          {result.location.venue_en} · {result.location.address_en}, {result.location.city_en},{' '}
          {result.location.state_en}
        </p>
      </div>
    </div>
  );
}

function AlertHeader({
  label,
  name,
  reference,
  guestCategory,
  passName,
  chips,
  icon,
}: {
  label: string;
  name: string;
  reference: string;
  guestCategory: string;
  passName?: string;
  chips: ReactNode[];
  icon: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 bg-red-700 px-4 py-4 text-white">
      <motion.span
        initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16 }}
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/15 ring-2 ring-white/40"
      >
        {icon}
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="font-ui text-[0.62rem] uppercase tracking-[0.18em] text-red-100">{label}</p>
        <p className="truncate font-display text-xl leading-tight">{name}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <GuestChip category={guestCategory} passName={passName} />
          {chips}
        </p>
      </div>
      <span className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 font-mono text-xs tracking-[0.08em]">
        {reference}
      </span>
    </div>
  );
}

function BlockedBody({ feedback }: { feedback: Extract<Feedback, { kind: 'blocked' }> }) {
  const info = feedback.blocked;
  const copy = {
    en: 'Entry blocked by admin',
    hi: 'प्रवेश रोक गया है',
    note: 'Call the help desk. Only the admin can lift this block.',
  };
  return (
    <div>
      <AlertHeader
        label="Entry blocked · प्रवेश रोकें"
        name={info.name}
        reference={info.reference}
        guestCategory={info.guestCategory}
        passName={info.ticketName}
        chips={[<LightChip key="chip">{copy.en}</LightChip>]}
        icon={<ShieldAlert size={30} />}
      />
      <div className="px-4 py-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="font-display text-base leading-tight text-red-900">
            {copy.en} <span className="text-red-700">· {copy.hi}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-red-900">Reason: {info.reason}</p>
          {info.blockedBy && <p className="mt-0.5 text-xs text-red-800/80">Blocked by {info.blockedBy}.</p>}
          <p className="mt-1 text-[0.72rem] text-red-800/90">{feedback.message}</p>
          <p className="mt-1.5 text-[0.7rem] text-red-800/75">{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

function DeniedBody({ feedback }: { feedback: Extract<Feedback, { kind: 'denied' }> }) {
  const denied = feedback.denied;
  const copy = DENIED_COPY[denied.code];
  const length = passLength(denied.passDays ?? denied.entriesAllowed);
  const lastScan = denied.lastEntryDate
    ? `${formatDay(denied.lastEntryDate)}${timeOnly(denied.lastEntryAt) ? ` at ${timeOnly(denied.lastEntryAt)}` : ''}`
    : 'Never scanned';
  const validity = denied.validFrom
    ? `${
        denied.validTo && denied.validTo !== denied.validFrom
          ? `${formatDay(denied.validFrom)} – ${formatDay(denied.validTo)}`
          : formatDay(denied.validFrom)
      }${timeOnly(denied.endTime) ? ` · gate closes ${timeOnly(denied.endTime)}` : ''}`
    : '—';

  return (
    <div>
      <AlertHeader
        label="Entry not allowed · प्रवेश नहीं"
        name={denied.name}
        reference={denied.reference}
        guestCategory={denied.guestCategory}
        passName={denied.ticketName}
        chips={[
          <LightChip key="reason">{copy.en}</LightChip>,
          ...(length ? [<LightChip key="length">{length}</LightChip>] : []),
        ]}
        icon={<XCircle size={34} strokeWidth={2.5} />}
      />

      <div className="space-y-3 px-4 py-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="font-display text-base leading-tight text-red-900">
            {copy.en} <span className="text-red-700">· {copy.hi}</span>
          </p>
          <p className="mt-1 text-[0.72rem] text-red-800/90">{feedback.message}</p>
          <p className="mt-1.5 text-[0.7rem] text-red-800/75">{copy.note}</p>
        </div>

        {denied.otherGate && (
          <p className="rounded-xl bg-red-600 px-3 py-2 text-[0.72rem] font-semibold leading-relaxed text-white">
            Do not allow entry · इस क्यूआर से प्रवेश मत दो
            <span className="mt-0.5 block font-normal text-red-50/90">
              This QR already opened a gate other than yours
              {denied.lastGate ? ` (${denied.lastGate})` : ''} — someone may have forwarded the same pass.
              Send this devotee to the help desk.
            </span>
          </p>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact
            tone="bad"
            icon={<Ticket size={15} />}
            label="Ticket bought"
            value={denied.ticketName || '—'}
            sub={`${denied.eventName || '—'}${length ? ` · ${length}` : ''}`}
          />
          <Fact
            tone="bad"
            icon={<CalendarDays size={15} />}
            label={denied.code === 'expired' ? 'Was valid' : 'Validity'}
            value={validity}
            sub={denied.expiredOn ? `Expired on ${formatDay(denied.expiredOn)}` : undefined}
          />
          <Fact
            tone="bad"
            icon={<Clock3 size={15} />}
            label="Last scanned"
            value={lastScan}
            sub={
              [
                denied.code === 'already_scanned'
                  ? `${denied.entriesToday ?? 0} of ${
                      denied.entriesTodayAllowed ?? denied.entriesAllowed ?? 0
                    } seats entered today`
                  : null,
                denied.entriesAllowed
                  ? `${denied.entriesUsed ?? 0} of ${denied.entriesAllowed} total entries used`
                  : null,
                denied.daysAllowed ? `${denied.daysUsed ?? 0} of ${denied.daysAllowed} event days used` : null,
                denied.lastGate
                  ? `Gate ${denied.lastGate}${denied.lastStaff ? ` · ${denied.lastStaff}` : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
          <Fact
            tone="bad"
            icon={<Users size={15} />}
            label="Booking"
            value={
              denied.code === 'not_paid'
                ? `Status: ${denied.status ?? 'pending'}`
                : `${denied.qty ?? 1} ${
                    (denied.qty ?? 1) === 1 ? 'seat' : 'seats'
                  } · ${denied.amount ? `${formatRupees(denied.amount)} paid` : 'Free pass'}`
            }
            sub={
              [
                denied.ticketName,
                denied.source === 'admin_free' ? 'Free issue by admin · निःशुल्क' : null,
                denied.guestCategory && denied.guestCategory !== 'visitor'
                  ? `${guestBadge(denied.guestCategory).en} guest`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || undefined
            }
          />
        </dl>
      </div>
    </div>
  );
}

function ErrorBody({ message, notFound }: { message: string; notFound?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-red-500 text-white">
        <XCircle size={26} />
      </span>
      <div className="min-w-0">
        <p className="font-ui text-[0.62rem] uppercase tracking-[0.18em] text-red-700">
          {notFound ? 'Pass not found' : 'Pass not accepted'}
        </p>
        <p className="mt-0.5 font-display text-lg leading-tight text-red-900">{message}</p>
        <p className="mt-1 text-xs text-muted">Check the code and try again, or search the booking in the admin panel.</p>
      </div>
    </div>
  );
}

export default function ScanConsole({
  scan,
  onCheckedIn,
  title = 'Scan a pass',
  offline = false,
}: {
  scan: (code: string, gate?: string, positions?: number[]) => Promise<CheckInResult>;
  onCheckedIn?: () => void;
  title?: string;
  offline?: boolean;
}) {
  const [manual, setManual] = useState('');
  const [gate, setGate] = useState(() => {
    try {
      return localStorage.getItem('ab-gate') || '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [camera, setCamera] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [stoppedAfterScan, setStoppedAfterScan] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [admitBusy, setAdmitBusy] = useState(false);
  const [admitError, setAdmitError] = useState('');
  const lastCodeRef = useRef('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const scanRef = useRef(scan);
  scanRef.current = scan;
  const gateRef = useRef(gate);
  gateRef.current = gate;
  const onCheckedInRef = useRef(onCheckedIn);
  onCheckedInRef.current = onCheckedIn;
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const readerIdRef = useRef(`qr-reader-${Math.random().toString(36).slice(2, 9)}`);
  const runScanRef = useRef<(code: string) => Promise<void>>(async () => undefined);

  const stopCamera = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        await scanner.stop();
      } catch {
        // Scanner was not running.
      }
      try {
        scanner.clear();
      } catch {
        // Element already detached.
      }
    }
    setCamera('idle');
  };

  const startCamera = async () => {
    if (camera === 'starting' || camera === 'running') return;
    setCameraError('');
    setFeedback(null);
    setStoppedAfterScan(false);
    setCamera('starting');
    try {
      const { Html5Qrcode: Scanner } = await import('html5-qrcode');
      const scanner = new Scanner(readerIdRef.current, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (width, height) => {
            const edge = Math.floor(Math.min(width, height) * 0.68);
            return { width: Math.max(160, edge), height: Math.max(160, edge) };
          },
          aspectRatio: 1,
        },
        (decodedText) => {
          void runScanRef.current(decodedText);
        },
        () => undefined,
      );
      setCamera('running');
    } catch {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        try {
          scanner.clear();
        } catch {
          // Nothing rendered yet.
        }
      }
      setCamera('error');
      setCameraError('Camera access was blocked. Allow camera permission, or type the code below.');
    }
  };

  const startCameraRef = useRef(startCamera);
  startCameraRef.current = startCamera;
  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;

  const runScan = async (raw: string) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;

    const now = Date.now();
    if (lastScanRef.current.code === code && now - lastScanRef.current.at < DEDUPE_MS) return;
    lastScanRef.current = { code, at: now };

    busyRef.current = true;
    setBusy(true);
    setStoppedAfterScan(Boolean(scannerRef.current));
    try {
      const result = await scanRef.current(code, gateRef.current.trim() || undefined);
      lastCodeRef.current = code;
      setPicked([]);
      setAdmitError('');
      setFeedback({ kind: 'success', result });
      setManual('');
      onCheckedInRef.current?.();
    } catch (error) {
      if (error instanceof AdminApiError && !error.status) lastScanRef.current = { code: '', at: 0 };
      if (error instanceof AdminApiError) {
        const details = error.details as
          | (Partial<BlockedInfo> &
              Partial<DenialInfo> & {
                blocked?: boolean;
                denied?: boolean;
                code?: string;
                reason?: string;
                ticket?: { name_en?: string };
                event?: { name_en?: string };
                schedule?: { end_time?: string };
              })
          | undefined;
        if (details?.blocked) {
          setFeedback({
            kind: 'blocked',
            message: error.message,
            blocked: {
              reference: String(details.reference ?? code.toUpperCase()),
              name: String(details.name ?? 'This devotee'),
              guestCategory: String(details.guestCategory ?? 'visitor'),
              ticketName: details.ticket?.name_en,
              reason: String(details.reason ?? 'Blocked by the admin.'),
              blockedBy: details.blockedBy ? String(details.blockedBy) : null,
            },
          });
        } else if (details?.denied) {
          const known: DenialCode[] = [
            'not_paid',
            'not_started',
            'expired',
            'entries_exhausted',
            'already_scanned',
            'live_code_invalid',
            'live_code_used',
            'live_code_expired',
            'static_disabled',
            'unknown_attendee',
          ];
          const rawCode = String(details.code ?? details.reason ?? '');
          setFeedback({
            kind: 'denied',
            message: error.message,
            denied: {
              reference: String(details.reference ?? code.toUpperCase()),
              name: String(details.name ?? 'This devotee'),
              guestCategory: String(details.guestCategory ?? 'visitor'),
              code: known.includes(rawCode as DenialCode) ? (rawCode as DenialCode) : 'unknown',
              status: details.status,
              source: details.source,
              qty: details.qty,
              amount: details.amount,
              passDays: details.passDays,
              validFrom: details.validFrom,
              validTo: details.validTo,
              expiredOn: details.expiredOn,
              entriesAllowed: details.entriesAllowed,
              entriesUsed: details.entriesUsed,
              entriesLeft: details.entriesLeft,
              entriesToday: details.entriesToday,
              entriesTodayAllowed: details.entriesTodayAllowed,
              entriesTodayLeft: details.entriesTodayLeft,
              daysUsed: details.daysUsed,
              daysAllowed: details.daysAllowed,
              lastEntryDate: details.lastEntryDate,
              lastEntryAt: details.lastEntryAt,
              lastGate: details.lastGate ?? null,
              lastStaff: details.lastStaff ?? null,
              otherGate: Boolean(details.otherGate),
              ticketName: details.ticketName ?? details.ticket?.name_en,
              eventName: details.eventName ?? details.event?.name_en,
              endTime: details.endTime ?? details.schedule?.end_time,
            },
          });
        } else {
          setFeedback({ kind: 'error', message: error.message, notFound: error.status === 404 });
        }
      } else {
        setFeedback({
          kind: 'error',
          message: 'Could not reach the server. Check the connection and try again.',
        });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      // One scan, one decision — the camera stops so the result popup is the only thing on screen.
      await stopCameraRef.current();
    }
  };
  runScanRef.current = runScan;

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              // Element already detached.
            }
          });
      }
    };
  }, []);

  const submitManual = (event: FormEvent) => {
    event.preventDefault();
    void runScan(manual);
  };

  const closeResult = () => {
    setFeedback(null);
    setPicked([]);
    setAdmitError('');
    setStoppedAfterScan(false);
  };

  const scanNext = () => {
    setFeedback(null);
    setPicked([]);
    setAdmitError('');
    void startCameraRef.current();
  };

  const success = feedback?.kind === 'success' ? feedback.result : null;
  const openPositions = (success?.attendees ?? []).filter((att) => !att.enteredToday).map((att) => att.position);
  const seatsLeftToday = Math.max(0, success?.checkIn.entriesTodayLeft ?? 0);

  const togglePick = (position: number) =>
    setPicked((current) =>
      current.includes(position) ? current.filter((item) => item !== position) : [...current, position].sort((a, b) => a - b),
    );

  const pickAllRemaining = () => setPicked(openPositions.slice(0, seatsLeftToday));

  const admitPicked = async () => {
    if (!lastCodeRef.current || picked.length === 0) return;
    setAdmitBusy(true);
    setAdmitError('');
    try {
      const result = await scanRef.current(lastCodeRef.current, gateRef.current.trim() || undefined, picked);
      setPicked([]);
      setFeedback({ kind: 'success', result });
      onCheckedInRef.current?.();
    } catch (error) {
      setAdmitError(error instanceof Error ? error.message : 'Those names could not be admitted.');
    } finally {
      setAdmitBusy(false);
    }
  };

  const edge =
    feedback?.kind === 'success'
      ? 'border-emerald-300'
      : feedback?.kind === 'error'
        ? 'border-red-300'
        : 'border-red-400';

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_18px_40px_-34px_rgba(15,35,66,.45)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sindoor text-marigold">
            <ScanLine size={17} />
          </span>
          <div>
            <h2 className="font-display text-xl leading-tight text-ink">{title}</h2>
            <p className="text-[0.7rem] text-muted">
              QR pass or reference number ·{' '}
              {offline ? "checked against this device's saved gate list" : 'checked against the live database'}
            </p>
          </div>
        </div>
        {camera === 'running' ? (
          <button
            type="button"
            onClick={() => void stopCamera()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-ui text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            <CameraOff size={14} /> Stop camera
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={camera === 'starting'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-saffron px-3 py-2 font-ui text-xs font-semibold text-white transition-colors hover:bg-saffron-dark disabled:opacity-60"
          >
            {camera === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {camera === 'starting' ? 'Starting camera…' : stoppedAfterScan ? 'Reopen camera' : 'Start camera'}
          </button>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {offline && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.72rem] font-semibold leading-relaxed text-amber-800">
            Offline mode — printed QR and AB26 references are checked against the saved gate list. Rotating live QR
            needs internet; ask for the reference number if the camera reads a live code.
          </p>
        )}
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-line/10 px-3 py-2.5 sm:flex-row sm:items-center">
          <span className="flex items-center gap-1.5 font-ui text-[0.62rem] uppercase tracking-[0.14em] text-muted">
            <MapPin size={13} className="text-saffron" /> Your gate
          </span>
          <input
            value={gate}
            onChange={(event) => {
              const next = event.target.value.slice(0, 60);
              setGate(next);
              try {
                localStorage.setItem('ab-gate', next);
              } catch {
                // Private mode — the label simply won't be remembered next time.
              }
            }}
            placeholder="e.g. Gate 2 — East entrance"
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            aria-label="Your gate name"
            className="field !py-2 text-sm sm:flex-1"
          />
          <p className="text-[0.65rem] leading-snug text-muted sm:max-w-[220px]">
            Saved per device. A QR scanned twice at another gate shows up here.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-sindoor-deep">
          <div id={readerIdRef.current} className="qr-reader min-h-[260px] w-full sm:min-h-[320px]" />

          {camera === 'running' && (
            <>
              <span className="pointer-events-none absolute left-4 top-4 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-marigold/80" />
              <span className="pointer-events-none absolute right-4 top-4 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-marigold/80" />
              <span className="pointer-events-none absolute bottom-4 left-4 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-marigold/80" />
              <span className="pointer-events-none absolute bottom-4 right-4 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-marigold/80" />
              <span className="scan-line pointer-events-none" />
              <span className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 font-ui text-[0.6rem] uppercase tracking-[0.16em] text-white/80">
                Point at the pass QR
              </span>
            </>
          )}

          {camera !== 'running' && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="max-w-[260px]">
                {camera === 'starting' ? (
                  <>
                    <Loader2 size={30} className="mx-auto animate-spin text-marigold" />
                    <p className="mt-3 font-ui text-sm text-cream-on-dark/75">Opening the camera…</p>
                  </>
                ) : (
                  <>
                    <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/[0.06]">
                      <QrCode size={26} className="text-marigold" />
                    </span>
                    <p className="mt-3 font-ui text-sm text-cream-on-dark/75">
                      {camera === 'error' ? 'Camera unavailable' : 'Camera is off'}
                    </p>
                    <p className="mt-1 text-[0.7rem] leading-relaxed text-cream-on-dark/45">
                      {cameraError ||
                        (stoppedAfterScan
                          ? 'Camera stopped after the last scan. Reopen it for the next devotee.'
                          : 'Start the camera to scan a devotee pass, or enter the code below.')}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={submitManual} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted/60" />
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value.toUpperCase())}
              placeholder="AB26-XXXXXX or QR code"
              autoComplete="off"
              spellCheck={false}
              aria-label="Pass reference or QR code"
              className="field !py-3 !pl-10 font-mono text-sm tracking-[0.1em]"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !manual.trim()}
            className="btn btn-primary inline-flex items-center justify-center gap-2 !py-3 disabled:opacity-50 sm:w-auto"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy ? 'Verifying…' : 'Check pass'}
          </button>
        </form>

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-saffron" />
            Matching this pass against the booking register…
          </p>
        )}
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 grid justify-center overflow-y-auto bg-ink/55 p-3 backdrop-blur-sm sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Scan result"
            onClick={closeResult}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
              className={`w-full max-w-lg self-start overflow-hidden rounded-2xl border bg-white shadow-[0_30px_70px_-20px_rgba(15,35,66,.55)] sm:self-center ${edge}`}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={closeResult}
                  aria-label="Close result"
                  className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/35"
                >
                  <X size={16} />
                </button>
                {feedback.kind === 'success' ? (
                  <SuccessBody
                    result={feedback.result}
                    picked={picked}
                    canAdmit={!offline}
                    busy={admitBusy}
                    error={admitError}
                    onToggle={togglePick}
                    onPickAll={pickAllRemaining}
                    onAdmit={() => void admitPicked()}
                  />
                ) : feedback.kind === 'error' ? (
                  <ErrorBody message={feedback.message} notFound={feedback.notFound} />
                ) : feedback.kind === 'blocked' ? (
                  <BlockedBody feedback={feedback} />
                ) : (
                  <DeniedBody feedback={feedback} />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-line/10 px-4 py-3">
                <p className="text-[0.68rem] text-muted">
                  {feedback.kind === 'success'
                    ? feedback.result.offline
                      ? 'Entry recorded offline — it will sync when the connection returns.'
                      : 'Devotee verified — let them through.'
                    : 'This pass cannot enter. Point the devotee to the help desk.'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeResult}
                    className="rounded-lg border border-line bg-white px-3 py-1.5 font-ui text-xs font-semibold text-ink transition-colors hover:bg-line/20"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={scanNext}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-saffron px-3 py-1.5 font-ui text-xs font-semibold text-white transition-colors hover:bg-saffron-dark"
                  >
                    <Camera size={13} /> Scan next pass
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
