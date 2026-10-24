import { query, withTransaction } from '../db.js';
import { HttpError } from './util.js';
import { audit } from './auth.js';
import { findActiveBlockOn } from './entryBlocks.js';

const DETAILS_SQL = `
  SELECT b.id, b.reference, b.name, b.email, b.phone, b.qty, b.pass_days, b.amount, b.status, b.qr_token,
         b.check_in_at, b.created_at, b.source, b.guest_category, b.discount_amount, b.coupon_code,
         e.id AS event_id, e.name_en AS event_name_en, e.name_hi AS event_name_hi, e.kind,
         tt.name_en AS ticket_name_en, tt.name_hi AS ticket_name_hi,
         s.event_date, s.end_date, s.start_time, s.end_time,
         st.name_en AS state_en, st.name_hi AS state_hi,
         c.name_en AS city_en, c.name_hi AS city_hi,
         v.name_en AS venue_en, v.name_hi AS venue_hi, v.address_en, v.address_hi,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', att.position, 'name', att.name, 'phone', att.phone))
            FROM event_booking_attendees att WHERE att.booking_id = b.id) AS attendees_json
  FROM event_bookings b
  JOIN events e ON e.id = b.event_id
  JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
  JOIN event_schedules s ON s.id = b.schedule_id
  JOIN event_states st ON st.id = s.state_id
  JOIN event_cities c ON c.id = s.city_id
  JOIN event_venues v ON v.id = s.venue_id
`;

function isToken(value) {
  return /^[a-f0-9]{32}$/i.test(value);
}

function isReference(value) {
  return /^AB[A-Z0-9-]{4,18}$/i.test(value);
}

function isoDate(value) {
  return String(value || '').slice(0, 10);
}

function dayGap(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateRangeLabel(startDate, endDate) {
  const start = dateFmt.format(new Date(`${startDate}T00:00:00Z`));
  if (startDate === endDate) return start;
  return `${start} – ${dateFmt.format(new Date(`${endDate}T00:00:00Z`))}`;
}

function dayLabel(date) {
  return dateFmt.format(new Date(`${date}T00:00:00Z`));
}

function passLabel(days) {
  return days === 1 ? 'single-day pass' : `${days}-day pass`;
}

const GUEST_LABELS = {
  visitor: 'Visitor',
  vip: 'VIP guest',
  press: 'Press',
  organiser: 'Organiser',
  staff: 'Gate staff',
  other: 'Other guest',
};

function guestLabel(value) {
  return GUEST_LABELS[String(value || 'visitor')] ?? 'Visitor';
}

function attendeeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Gate labels come from a staff-controlled field; keep them short, single-line and blank-safe. */
function normalizeGate(value) {
  const label = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return label || null;
}

/** Scan logs are readable by every staff account, so never store a full credential in them. */
function codeHint(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return `${raw.slice(0, 4)}***${raw.slice(-2)}`.slice(0, 24);
}

function gateKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Two guards typing "Gate 2" and "gate-2" mean the same physical gate. */
function isSameGate(a, b) {
  if (!a || !b) return false;
  return gateKey(a) === gateKey(b);
}

/** The sentence a guard needs when a QR comes in twice: who took the first entry, and from where. */
function whereScanned(lastScan, sameGate) {
  if (!lastScan.gate) return '';
  const by = lastScan.staff ? ` by ${lastScan.staff}` : '';
  return sameGate
    ? `It was taken at your gate (${lastScan.gate})${by}. `
    : `It was already taken at GATE ${lastScan.gate}${by} — this looks like a forwarded QR. `;
}

async function lastScanAt(conn, bookingId) {
  const [rows] = await conn.execute(
    `SELECT c.gate, a.name AS staff_name
     FROM event_booking_checkins c
     LEFT JOIN admins a ON a.id = c.checked_in_by
     WHERE c.booking_id = ?
     ORDER BY c.entry_date DESC, c.created_at DESC, c.id DESC
     LIMIT 1`,
    [bookingId],
  );
  return { gate: rows[0]?.gate || null, staff: rows[0]?.staff_name || null };
}

/**
 * A rejection is the only visible trace a forwarded QR leaves, since a booking can hold just one
 * entry per day. Losing this log loses the duplicate-gate alert, but it must never be the reason a
 * gate stops working — so it is best-effort.
 */
async function logDeniedScan({ err, attempted, code, gate, staffId }) {
  const details = err?.details || {};
  const reason = details.blocked
    ? 'blocked'
    : String(details.reason || (err?.status === 404 ? 'not_found' : err?.status === 400 ? 'bad_code' : 'rejected'));
  try {
    await query(
      `INSERT INTO event_scan_denials (booking_id, reference, code_hint, reason, gate, other_gate, entry_date, staff_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attempted.bookingId ?? null,
        attempted.reference ?? null,
        codeHint(code),
        reason.slice(0, 32),
        gate,
        details.otherGate ? 1 : 0,
        attempted.today,
        staffId,
      ],
    );
  } catch {
    /* the gate keeps scanning; the audit trail still holds the attempt */
  }
}

/**
 * Gate guards need more than a sentence when a pass is refused — the identity, the ticket bought,
 * how many days the pass carries and when it was last scanned. The scanner renders this as a
 * "not allowed" card, so every denial below must stay machine-readable.
 */
function denialDetails(booking, extra) {
  return {
    denied: true,
    reference: booking.reference,
    name: booking.name,
    qty: Number(booking.qty),
    amount: Number(booking.amount),
    status: booking.status,
    source: booking.source || 'online',
    guestCategory: booking.guest_category || 'visitor',
    guestLabel: guestLabel(booking.guest_category),
    ticket: { name_en: booking.ticket_name_en, name_hi: booking.ticket_name_hi },
    event: { name_en: booking.event_name_en, name_hi: booking.event_name_hi },
    schedule: {
      event_date: booking.event_date,
      end_date: booking.end_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
    },
    ...extra,
  };
}

export async function checkInBooking({ code, actor, ip, gate }) {
  const value = String(code || '').trim();
  const gateLabel = normalizeGate(gate);
  if (!isToken(value) && !isReference(value)) {
    throw new HttpError(400, 'This is not a valid pass code or reference number.');
  }

  // Filled as the lookup proceeds so a rejected scan can still be written to the denial log.
  const attempted = { bookingId: null, reference: null, today: null };

  let result;
  try {
    result = await withTransaction(async (conn) => {
    const [rows] = isToken(value)
      ? await conn.execute(`${DETAILS_SQL} WHERE b.qr_token = ? LIMIT 1 FOR UPDATE`, [value])
      : await conn.execute(`${DETAILS_SQL} WHERE b.reference = ? LIMIT 1 FOR UPDATE`, [value.toUpperCase()]);

    const booking = rows[0];
    if (!booking) throw new HttpError(404, 'This pass was not found in our database.');
    attempted.bookingId = booking.id;
    attempted.reference = booking.reference;
    if (booking.status !== 'paid') {
      throw new HttpError(409, `Pass status is "${booking.status}". Entry is not allowed.`, denialDetails(booking, {
        reason: 'not_paid',
      }));
    }

    const block = await findActiveBlockOn(conn, {
      bookingId: booking.id,
      email: booking.email,
      phone: booking.phone,
      eventId: booking.event_id,
    });
    if (block) {
      await audit({
        actorType: 'admin',
        actorId: actor.id,
        action: 'event.check_in.blocked',
        entity: 'event_booking',
        entityId: String(booking.id),
        meta: { reference: booking.reference, blockId: block.id, reason: block.reason, gate: gateLabel },
        ip,
      });
      throw new HttpError(
        403,
        `ENTRY BLOCKED — ${booking.name} (${guestLabel(booking.guest_category)}): ${block.reason}. Call the help desk.`,
        {
          blocked: true,
          reference: booking.reference,
          name: booking.name,
          guestCategory: booking.guest_category || 'visitor',
          reason: block.reason,
          blockedBy: block.blocked_by_name || null,
        },
      );
    }

    const [[{ today }]] = await conn.query('SELECT CURDATE() AS today');
    attempted.today = isoDate(today);
    const startDate = isoDate(booking.event_date);
    const endDate = isoDate(booking.end_date || booking.event_date);
    const calendarDays = dayGap(startDate, endDate) + 1;
    const entriesAllowed = Math.max(1, Math.min(Number(booking.pass_days || 1), calendarDays));

    if (today < startDate) {
      throw new HttpError(
        409,
        `This pass is valid from ${dateRangeLabel(startDate, endDate)}. Entry is not open yet.`,
        denialDetails(booking, { reason: 'not_started', validFrom: startDate, validTo: endDate, entriesUsed: 0 }),
      );
    }
    if (today > endDate) {
      throw new HttpError(
        409,
        `This pass expired on ${dateRangeLabel(startDate, endDate)}. Entry is closed.`,
        denialDetails(booking, { reason: 'expired', validFrom: startDate, validTo: endDate, expiredOn: endDate }),
      );
    }

    const [used] = await conn.execute(
      `SELECT COUNT(*) AS days, MAX(entry_date) AS last_day, MAX(created_at) AS last_at
       FROM event_booking_checkins WHERE booking_id = ?`,
      [booking.id],
    );
    const daysUsed = Number(used[0].days);

    if (daysUsed >= entriesAllowed) {
      const lastScan = await lastScanAt(conn, booking.id);
      const lastDay = isoDate(used[0].last_day);
      const when =
        lastDay === today
          ? `Last entry today at ${String(used[0].last_at).slice(11, 16)}.`
          : `Last entry on ${dayLabel(lastDay)}.`;
      const sameGate = isSameGate(lastScan.gate, gateLabel);
      throw new HttpError(
        409,
        `This ${passLabel(entriesAllowed)} is fully used — ${daysUsed} of ${entriesAllowed} ${
          entriesAllowed === 1 ? 'day is' : 'days are'
        } entered. ${when} ${whereScanned(lastScan, sameGate)}No entry left.`,
        denialDetails(booking, {
          reason: 'entries_exhausted',
          validFrom: startDate,
          validTo: endDate,
          passDays: entriesAllowed,
          entriesAllowed,
          entriesUsed: daysUsed,
          entriesLeft: 0,
          dayNumber: dayGap(startDate, today) + 1,
          calendarDays,
          lastEntryDate: lastDay,
          lastEntryAt: used[0].last_at,
          lastGate: lastScan.gate,
          lastStaff: lastScan.staff,
          otherGate: !sameGate && Boolean(lastScan.gate && gateLabel),
        }),
      );
    }

    const dayNumber = dayGap(startDate, today) + 1;

    const [existing] = await conn.execute(
      `SELECT c.created_at, c.gate, a.name AS staff_name
       FROM event_booking_checkins c
       LEFT JOIN admins a ON a.id = c.checked_in_by
       WHERE c.booking_id = ? AND c.entry_date = ? LIMIT 1`,
      [booking.id, today],
    );
    if (existing[0]) {
      const time = String(existing[0].created_at).slice(11, 16);
      const lastScan = { gate: existing[0].gate || null, staff: existing[0].staff_name || null };
      // daysUsed already counts today, and the exhausted branch above ruled out daysUsed >= entriesAllowed.
      const left = entriesAllowed - daysUsed;
      const sameGate = isSameGate(lastScan.gate, gateLabel);
      throw new HttpError(
        409,
        entriesAllowed === 1
          ? `This pass was already checked in today at ${time}. ${whereScanned(lastScan, sameGate)}A single-day pass allows one entry.`
          : `This pass is already used today at ${time}. ${whereScanned(lastScan, sameGate)}${left} more ${
              left === 1 ? 'entry is' : 'entries are'
            } still open on later event days.`,
        denialDetails(booking, {
          reason: 'already_scanned',
          validFrom: startDate,
          validTo: endDate,
          passDays: entriesAllowed,
          entriesAllowed,
          entriesUsed: daysUsed,
          entriesLeft: left,
          dayNumber,
          calendarDays,
          lastEntryDate: today,
          lastEntryAt: existing[0].created_at,
          lastGate: lastScan.gate,
          lastStaff: lastScan.staff,
          otherGate: !sameGate && Boolean(lastScan.gate && gateLabel),
        }),
      );
    }

    await conn.execute(
      'INSERT INTO event_booking_checkins (booking_id, entry_date, checked_in_by, gate) VALUES (?, ?, ?, ?)',
      [booking.id, today, actor.id, gateLabel],
    );
    await conn.execute(
      `UPDATE event_bookings
       SET check_in_at = COALESCE(check_in_at, NOW()),
           checked_in_by = COALESCE(checked_in_by, ?)
       WHERE id = ?`,
      [actor.id, booking.id],
    );

      const entriesUsed = daysUsed + 1;
      return {
        ...booking,
        check_in_at: 'now',
        entryDate: today,
        gate: gateLabel,
        dayNumber,
        calendarDays,
        entriesAllowed,
        entriesUsed,
        entriesLeft: entriesAllowed - entriesUsed,
      };
    });
  } catch (err) {
    await logDeniedScan({
      err,
      attempted,
      code: value,
      gate: gateLabel,
      staffId: actor?.id ?? null,
    });
    throw err;
  }

  await audit({
    actorType: 'admin',
    actorId: actor.id,
    action: 'event.check_in',
    entity: 'event_booking',
    entityId: String(result.id),
    meta: {
      reference: result.reference,
      qty: Number(result.qty),
      mode: isToken(value) ? 'qr' : 'reference',
      gate: result.gate,
      entryDate: result.entryDate,
      dayNumber: result.dayNumber,
      entriesUsed: result.entriesUsed,
      entriesAllowed: result.entriesAllowed,
    },
    ip,
  });

  return {
    allowed: true,
    reference: result.reference,
    name: result.name,
    email: result.email,
    phone: result.phone,
    qty: Number(result.qty),
    amount: Number(result.amount),
    discount: Number(result.discount_amount || 0),
    couponCode: result.coupon_code || null,
    source: result.source || 'online',
    guestCategory: result.guest_category || 'visitor',
    guestLabel: guestLabel(result.guest_category),
    passDays: result.entriesAllowed,
    gate: result.gate,
    validFrom: isoDate(result.event_date),
    validTo: isoDate(result.end_date || result.event_date),
    attendees: attendeeList(result.attendees_json),
    status: result.status,
    checkedInAt: new Date().toISOString(),
    checkIn: {
      entryDate: result.entryDate,
      dayNumber: result.dayNumber,
      calendarDays: result.calendarDays,
      entriesUsed: result.entriesUsed,
      entriesAllowed: result.entriesAllowed,
      entriesLeft: result.entriesLeft,
    },
    event: { name_en: result.event_name_en, name_hi: result.event_name_hi, kind: result.kind },
    ticket: { name_en: result.ticket_name_en, name_hi: result.ticket_name_hi },
    schedule: {
      event_date: result.event_date,
      end_date: result.end_date,
      start_time: result.start_time,
      end_time: result.end_time,
    },
    location: {
      state_en: result.state_en,
      state_hi: result.state_hi,
      city_en: result.city_en,
      city_hi: result.city_hi,
      venue_en: result.venue_en,
      venue_hi: result.venue_hi,
      address_en: result.address_en,
      address_hi: result.address_hi,
    },
  };
}
