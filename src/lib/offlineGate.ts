import {
  AdminApiError,
  type CheckInResult,
  type OfflinePack,
  type OfflinePackBlock,
  type OfflinePackBooking,
  type OfflineScanInput,
} from '@/lib/adminApi';

const PACK_PREFIX = 'ab-gate-pack-v1-';
const QUEUE_PREFIX = 'ab-gate-queue-v1-';
const MAX_QUEUE = 500;

export interface CachedGatePack {
  savedAt: string;
  staffId: number;
  pack: OfflinePack;
}

export interface QueuedGateScan {
  clientId: string;
  code: string;
  gate: string | null;
  entryDate: string;
  scannedAt: string;
}

const packKey = (staffId: number) => `${PACK_PREFIX}${staffId}`;
const queueKey = (staffId: number) => `${QUEUE_PREFIX}${staffId}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadCachedPack(staffId: number): CachedGatePack | null {
  const cached = readJson<CachedGatePack>(packKey(staffId));
  if (!cached || cached.staffId !== staffId || !cached.pack) return null;
  return cached;
}

export function saveCachedPack(staffId: number, pack: OfflinePack): CachedGatePack | null {
  const cached: CachedGatePack = { savedAt: new Date().toISOString(), staffId, pack };
  return writeJson(packKey(staffId), cached) ? cached : null;
}

export function loadQueue(staffId: number): QueuedGateScan[] {
  const queue = readJson<QueuedGateScan[]>(queueKey(staffId));
  return Array.isArray(queue) ? queue.slice(0, MAX_QUEUE) : [];
}

export function saveQueue(staffId: number, queue: QueuedGateScan[]) {
  writeJson(queueKey(staffId), queue.slice(0, MAX_QUEUE));
}

export function enqueueScan(staffId: number, scan: QueuedGateScan): QueuedGateScan[] {
  const queue = loadQueue(staffId);
  if (queue.some((item) => item.clientId === scan.clientId)) return queue;
  const next = [...queue, scan].slice(-MAX_QUEUE);
  saveQueue(staffId, next);
  return next;
}

export function clearGateCache(staffId: number) {
  try {
    localStorage.removeItem(packKey(staffId));
    localStorage.removeItem(queueKey(staffId));
  } catch {
    // Storage unavailable — nothing to clear.
  }
}

export function makeScanId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // Fall through to the timestamp-based id.
  }
  return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Venue-local calendar day; a scan at 00:30 IST must count for the new event day. */
export function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayGap(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function toQueuedScan(code: string, gate: string | null, now: Date): QueuedGateScan {
  return {
    clientId: makeScanId(),
    code,
    gate,
    entryDate: localDay(now),
    scannedAt: now.toISOString(),
  };
}

export function queueOfflineScan(staffId: number, code: string, gate: string | null, now = new Date()) {
  const scan = toQueuedScan(code, gate, now);
  const queue = enqueueScan(staffId, scan);
  return { scan, queue };
}

interface Counts {
  startDate: string;
  endDate: string;
  calendarDays: number;
  daysAllowed: number;
  seats: number;
  entriesUsed: number;
  entriesToday: number;
  daysUsed: number;
  dayNumber: number;
  totalAllowed: number;
}

function countsFor(booking: OfflinePackBooking, day: string): Counts {
  const startDate = booking.schedule.event_date;
  const endDate = booking.schedule.end_date || startDate;
  const calendarDays = Math.max(1, dayGap(startDate, endDate) + 1);
  const daysAllowed = Math.max(1, Math.min(booking.passDays || 1, calendarDays));
  const seats = Math.max(1, booking.qty || 1);
  const entriesUsed = Math.max(0, Number(booking.entries.used) || 0);
  const entriesToday = Math.max(0, Number(booking.entries.today) || 0);
  const daysUsed = Math.max(0, Number(booking.entries.daysUsed) || 0);
  return {
    startDate,
    endDate,
    calendarDays,
    daysAllowed,
    seats,
    entriesUsed,
    entriesToday,
    daysUsed,
    dayNumber: Math.max(1, dayGap(startDate, day) + 1),
    totalAllowed: seats * daysAllowed,
  };
}

function matchesBlock(block: OfflinePackBlock, booking: OfflinePackBooking) {
  if (block.scope === 'event' && block.eventId && block.eventId !== booking.event.id) return false;
  if (block.scope !== 'event' && block.scope !== 'all_events') return false;
  if (block.bookingId && block.bookingId === booking.id) return true;
  if (block.email && block.email.toLowerCase() === booking.email.toLowerCase()) return true;
  if (block.phone) {
    const wanted = block.phone.replace(/\D/g, '');
    const actual = String(booking.phone || '').replace(/\D/g, '');
    if (wanted && wanted === actual) return true;
  }
  return false;
}

function denial(
  booking: OfflinePackBooking,
  counts: Counts,
  reason: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return new AdminApiError(message, 409, {
    denied: true,
    reference: booking.reference,
    name: booking.name,
    qty: booking.qty,
    amount: booking.amount,
    status: booking.status,
    source: booking.source,
    guestCategory: booking.guestCategory,
    ticket: booking.ticket,
    event: booking.event,
    schedule: booking.schedule,
    reason,
    validFrom: counts.startDate,
    validTo: counts.endDate,
    passDays: counts.daysAllowed,
    entriesAllowed: counts.totalAllowed,
    entriesUsed: counts.entriesUsed,
    entriesLeft: Math.max(0, counts.totalAllowed - counts.entriesUsed),
    entriesToday: counts.entriesToday,
    entriesTodayAllowed: counts.seats,
    entriesTodayLeft: Math.max(0, counts.seats - counts.entriesToday),
    daysUsed: counts.daysUsed,
    daysAllowed: counts.daysAllowed,
    dayNumber: counts.dayNumber,
    calendarDays: counts.calendarDays,
    ...extra,
  });
}

function findBooking(pack: OfflinePack, code: string) {
  if (/^[a-f0-9]{32}$/i.test(code)) {
    const token = code.toLowerCase();
    return pack.bookings.find((booking) => String(booking.qrToken || '').toLowerCase() === token) ?? null;
  }
  const reference = code.toUpperCase();
  return pack.bookings.find((booking) => booking.reference === reference) ?? null;
}

/**
 * Mirrors the server's gate rules against the cached list. Live rotating codes cannot
 * be verified without the server; printed QR tokens and AB26 references can.
 */
export function scanFromPack(
  pack: OfflinePack,
  rawCode: string,
  rawGate = '',
  now = new Date(),
): { result: CheckInResult; booking: OfflinePackBooking } {
  const code = rawCode.trim();
  const gate = rawGate.replace(/\s+/g, ' ').trim().slice(0, 60) || null;
  const liveMatch = /^ABDYN-([A-Z0-9-]{8,19})-([A-Z0-9]{10})$/i.exec(code);
  if (liveMatch) {
    const reference = liveMatch[1].toUpperCase();
    const booking = pack.bookings.find((item) => item.reference === reference);
    if (booking) {
      const day = localDay(now);
      throw denial(
        booking,
        countsFor(booking, day),
        'live_code_invalid',
        'The live rotating QR needs internet. Ask for the printed pass QR or the AB26 reference — those work offline.',
      );
    }
    throw new AdminApiError(
      'The live rotating QR needs internet. Ask the devotee for the printed pass QR or their AB26 reference.',
      409,
    );
  }

  if (!/^[a-f0-9]{32}$/i.test(code) && !/^AB[A-Z0-9-]{4,18}$/i.test(code.toUpperCase())) {
    throw new AdminApiError('This is not a valid pass code or reference number.', 400);
  }

  const booking = findBooking(pack, code);
  if (!booking) {
    throw new AdminApiError(
      'This pass is not in the offline list on this device. It may be a new booking — reconnect to verify it.',
      404,
    );
  }

  const day = localDay(now);
  const counts = countsFor(booking, day);

  const block = pack.blocks.find((item) => matchesBlock(item, booking));
  if (block) {
    throw new AdminApiError(`ENTRY BLOCKED — ${booking.name}: ${block.reason}. Call the help desk.`, 403, {
      blocked: true,
      reference: booking.reference,
      name: booking.name,
      guestCategory: booking.guestCategory || 'visitor',
      ticket: booking.ticket,
      reason: block.reason,
      blockedBy: block.blockedBy,
    });
  }

  if (day < counts.startDate) {
    throw denial(
      booking,
      counts,
      'not_started',
      `This pass is valid from ${counts.startDate}${counts.endDate !== counts.startDate ? ` to ${counts.endDate}` : ''}. Entry is not open yet.`,
    );
  }
  if (day > counts.endDate) {
    throw denial(booking, counts, 'expired', `This pass expired on ${counts.endDate}. Entry is closed.`, {
      expiredOn: counts.endDate,
    });
  }
  if (counts.entriesToday === 0 && counts.daysUsed >= counts.daysAllowed) {
    throw denial(
      booking,
      counts,
      'entries_exhausted',
      `This ${counts.daysAllowed === 1 ? 'single-day pass has' : `${counts.daysAllowed}-day pass has`} already used every event day.`,
      {
        lastEntryDate: booking.entries.lastEntryDate,
        lastEntryAt: booking.entries.lastEntryAt,
        lastGate: booking.entries.lastGate,
        lastStaff: booking.entries.lastStaff,
      },
    );
  }
  if (counts.entriesToday >= counts.seats) {
    throw denial(
      booking,
      counts,
      'already_scanned',
      `All ${counts.seats} ${counts.seats === 1 ? 'seat' : 'seats'} on this booking have already entered today.`,
      {
        lastEntryDate: booking.entries.lastEntryDate || day,
        lastEntryAt: booking.entries.lastEntryAt,
        lastGate: booking.entries.lastGate,
        lastStaff: booking.entries.lastStaff,
        otherGate: Boolean(booking.entries.lastGate && gate),
      },
    );
  }

  const entriesToday = counts.entriesToday + 1;
  const entriesUsed = counts.entriesUsed + 1;
  const daysUsed = counts.entriesToday > 0 ? counts.daysUsed : counts.daysUsed + 1;
  const entriesLeft = Math.max(0, counts.totalAllowed - entriesUsed);

  const result: CheckInResult = {
    allowed: true,
    offline: true,
    reference: booking.reference,
    name: booking.name,
    email: booking.email,
    phone: booking.phone,
    qty: Number(booking.qty),
    amount: Number(booking.amount),
    source: booking.source as CheckInResult['source'],
    guestCategory: booking.guestCategory as CheckInResult['guestCategory'],
    passDays: counts.daysAllowed,
    gate,
    liveCode: false,
    validFrom: counts.startDate,
    validTo: counts.endDate,
    attendees: booking.attendees,
    status: booking.status,
    checkedInAt: now.toISOString(),
    checkIn: {
      entryDate: day,
      dayNumber: counts.dayNumber,
      calendarDays: counts.calendarDays,
      seats: counts.seats,
      entriesToday,
      entriesTodayAllowed: counts.seats,
      entriesTodayLeft: Math.max(0, counts.seats - entriesToday),
      daysUsed,
      daysAllowed: counts.daysAllowed,
      daysLeft: Math.max(0, counts.daysAllowed - daysUsed),
      entriesUsed,
      entriesAllowed: counts.totalAllowed,
      entriesLeft,
    },
    event: booking.event,
    ticket: booking.ticket,
    schedule: booking.schedule,
    location: booking.location,
  };

  return { result, booking };
}

/** Keep the cached counters in step with an entry admitted offline. */
export function applyOfflineEntry(pack: OfflinePack, booking: OfflinePackBooking, result: CheckInResult, now = new Date()): OfflinePack {
  return {
    ...pack,
    bookings: pack.bookings.map((item) =>
      item.id === booking.id
        ? {
            ...item,
            entries: {
              used: result.checkIn.entriesUsed,
              daysUsed: result.checkIn.daysUsed,
              today: result.checkIn.entriesToday,
              lastEntryDate: result.checkIn.entryDate,
              lastEntryAt: now.toISOString(),
              lastGate: result.gate ?? null,
              lastStaff: pack.staff.name,
            },
          }
        : item,
    ),
  };
}

export function applyOnlineEntry(pack: OfflinePack, result: CheckInResult): OfflinePack {
  return {
    ...pack,
    bookings: pack.bookings.map((item) =>
      item.reference === result.reference
        ? {
            ...item,
            entries: {
              used: result.checkIn.entriesUsed,
              daysUsed: result.checkIn.daysUsed,
              today: result.checkIn.entriesToday,
              lastEntryDate: result.checkIn.entryDate,
              lastEntryAt: result.checkedInAt,
              lastGate: result.gate ?? null,
              lastStaff: pack.staff.name,
            },
          }
        : item,
    ),
  };
}

/** Old packs (from a previous event day) must not admit anyone silently. */
export function packAgeDays(pack: OfflinePack, now = new Date()) {
  const saved = String(pack.generatedAt || '').slice(0, 10);
  return Math.abs(dayGap(saved, localDay(now)));
}

export function queuedToInput(scan: QueuedGateScan): OfflineScanInput {
  return {
    clientId: scan.clientId,
    code: scan.code,
    gate: scan.gate,
    entryDate: scan.entryDate,
    scannedAt: scan.scannedAt,
  };
}
