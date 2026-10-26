import { query, withTransaction } from '../db.js';
import { HttpError } from './util.js';
import { audit } from './auth.js';
import { findActiveBlockOn } from './entryBlocks.js';
import { getGateSettings } from './settings.js';
import { parseLiveCode } from './passCodes.js';

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

/** Names ticked by gate staff, de-duplicated and sorted so one scan can admit that many seats. */
export function normalizePositions(value) {
  if (value === undefined || value === null || value === '' || value.length === 0) return null;
  if (!Array.isArray(value)) throw new HttpError(400, 'The attendee selection must be a list of names.');
  const positions = [...new Set(value.map((item) => Number(item)))].sort((a, b) => a - b);
  if (positions.length === 0) return null;
  if (positions.length > 200) throw new HttpError(400, 'Too many names selected for one entry.');
  if (positions.some((position) => !Number.isInteger(position) || position < 1)) {
    throw new HttpError(400, 'The attendee selection is not valid.');
  }
  return positions;
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

/** The sentence a guard needs when a pass quota is full: who took the last entry, and from where. */
function whereScanned(lastScan, sameGate) {
  if (!lastScan.gate) return '';
  const by = lastScan.staff ? ` by ${lastScan.staff}` : '';
  return sameGate
    ? `Last entry was at your gate (${lastScan.gate})${by}. `
    : `Last entry was at a different gate — ${lastScan.gate}${by}. `;
}

async function lastScanAt(conn, bookingId) {
  const [rows] = await conn.execute(
    `SELECT c.gate, c.created_at, a.name AS staff_name
     FROM event_booking_checkins c
     LEFT JOIN admins a ON a.id = c.checked_in_by
     WHERE c.booking_id = ?
     ORDER BY c.entry_date DESC, c.created_at DESC, c.id DESC
     LIMIT 1`,
    [bookingId],
  );
  return {
    gate: rows[0]?.gate || null,
    staff: rows[0]?.staff_name || null,
    at: rows[0]?.created_at || null,
  };
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

export async function checkInBooking({
  code,
  actor,
  ip,
  gate,
  entryDate = null,
  clientScanId = null,
  positions = null,
}) {
  const value = String(code || '').trim();
  const gateLabel = normalizeGate(gate);
  const wanted = normalizePositions(positions);
  const offlineSync = Boolean(clientScanId);
  const live = parseLiveCode(value);
  if (!live && !isToken(value) && !isReference(value)) {
    throw new HttpError(400, 'This is not a valid pass code or reference number.');
  }

  // Filled as the lookup proceeds so a rejected scan can still be written to the denial log.
  const attempted = { bookingId: null, reference: null, today: null };

  let result;
  try {
    result = await withTransaction(async (conn) => {
    const [rows] = live
      ? await conn.execute(`${DETAILS_SQL} WHERE b.reference = ? LIMIT 1 FOR UPDATE`, [live.reference])
      : isToken(value)
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
          ticket: { name_en: booking.ticket_name_en, name_hi: booking.ticket_name_hi },
          reason: block.reason,
          blockedBy: block.blocked_by_name || null,
        },
      );
    }

    let liveCodeRow = null;
    if (live) {
      const [codes] = await conn.execute(
        `SELECT id, used_at, used_gate, (expires_at <= NOW()) AS expired
           FROM event_pass_codes
          WHERE booking_id = ? AND code = ?
          LIMIT 1 FOR UPDATE`,
        [booking.id, live.code],
      );
      liveCodeRow = codes[0];
      if (!liveCodeRow) {
        throw new HttpError(
          409,
          'This live QR is not recognised. Ask the devotee to refresh the pass screen and show the new code.',
          denialDetails(booking, { reason: 'live_code_invalid' }),
        );
      }
      if (liveCodeRow.used_at) {
        const when = String(liveCodeRow.used_at).slice(0, 16);
        const superseded = liveCodeRow.used_gate === 'superseded';
        const where = liveCodeRow.used_gate && !superseded ? ` at ${liveCodeRow.used_gate}` : '';
        throw new HttpError(
          409,
          superseded
            ? 'This live QR was replaced by a newer code on the devotee’s screen. Ask them to show the code that is visible now.'
            : `This live QR was already used${where} (${when}). A live code works only once — ask for a fresh code on the pass screen.`,
          denialDetails(booking, {
            reason: 'live_code_used',
            lastGate: superseded ? null : liveCodeRow.used_gate || null,
            lastEntryAt: when,
          }),
        );
      }
      if (Number(liveCodeRow.expired)) {
        throw new HttpError(
          409,
          'This live QR has expired. Ask the devotee to refresh the pass screen — a new code appears every minute.',
          denialDetails(booking, { reason: 'live_code_expired' }),
        );
      }
    } else if (!offlineSync && (await getGateSettings()).live_qr_only) {
      throw new HttpError(
        409,
        'Static QR passes are switched off. Ask the devotee to open the live pass and show the rotating QR.',
        denialDetails(booking, { reason: 'static_disabled' }),
      );
    }

    const [[{ today: serverTodayRaw }]] = await conn.query('SELECT CURDATE() AS today');
    const serverToday = isoDate(serverTodayRaw);
    let today = serverToday;
    if (entryDate) {
      const requested = isoDate(entryDate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || Number.isNaN(Date.parse(`${requested}T00:00:00Z`))) {
        throw new HttpError(400, 'This offline scan has an invalid entry date.');
      }
      if (dayGap(requested, serverToday) > 2) {
        throw new HttpError(400, 'This offline scan is more than two days old and cannot be synced.');
      }
      if (dayGap(serverToday, requested) > 0) {
        throw new HttpError(400, 'An offline scan cannot carry a future entry date.');
      }
      today = requested;
    }
    attempted.today = today;
    const startDate = isoDate(booking.event_date);
    const endDate = isoDate(booking.end_date || booking.event_date);
    const calendarDays = dayGap(startDate, endDate) + 1;
    const daysAllowed = Math.max(1, Math.min(Number(booking.pass_days || 1), calendarDays));
    // One QR covers everyone on the booking, so each scan admits one seat. A 5-seat
    // single-day pass can therefore collect five rows for the same entry_date.
    const seats = Math.max(1, Number(booking.qty) || 1);
    const totalEntriesAllowed = seats * daysAllowed;

    if (today < startDate) {
      throw new HttpError(
        409,
        `This pass is valid from ${dateRangeLabel(startDate, endDate)}. Entry is not open yet.`,
        denialDetails(booking, {
          reason: 'not_started',
          validFrom: startDate,
          validTo: endDate,
          passDays: daysAllowed,
          entriesAllowed: totalEntriesAllowed,
          entriesUsed: 0,
          entriesToday: 0,
          entriesTodayAllowed: seats,
          entriesTodayLeft: seats,
          daysUsed: 0,
          daysAllowed,
          calendarDays,
        }),
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
      `SELECT COUNT(*) AS entries,
              COUNT(DISTINCT entry_date) AS days,
              COALESCE(SUM(entry_date = ?), 0) AS today_entries,
              MAX(entry_date) AS last_day,
              MAX(created_at) AS last_at
       FROM event_booking_checkins WHERE booking_id = ?`,
      [today, booking.id],
    );
    const entriesUsed = Number(used[0].entries);
    const daysUsed = Number(used[0].days);
    const entriesToday = Number(used[0].today_entries);
    const entriesLeft = Math.max(0, totalEntriesAllowed - entriesUsed);
    const dayNumber = dayGap(startDate, today) + 1;

    // No new event day is available once the pass has already used its covered days.
    if (entriesToday === 0 && daysUsed >= daysAllowed) {
      const lastScan = await lastScanAt(conn, booking.id);
      const lastDay = isoDate(used[0].last_day);
      const sameGate = isSameGate(lastScan.gate, gateLabel);
      throw new HttpError(
        409,
        `This ${passLabel(daysAllowed)} is used up — all ${daysAllowed} event ${
          daysAllowed === 1 ? 'day has' : 'days have'
        } already been entered. Last entry on ${dayLabel(lastDay)}. ${whereScanned(
          lastScan,
          sameGate,
        )}No entry left for later dates.`,
        denialDetails(booking, {
          reason: 'entries_exhausted',
          validFrom: startDate,
          validTo: endDate,
          passDays: daysAllowed,
          entriesAllowed: totalEntriesAllowed,
          entriesUsed,
          entriesLeft,
          entriesToday,
          entriesTodayAllowed: seats,
          entriesTodayLeft: Math.max(0, seats - entriesToday),
          daysUsed,
          daysAllowed,
          dayNumber,
          calendarDays,
          lastEntryDate: lastDay,
          lastEntryAt: used[0].last_at,
          lastGate: lastScan.gate,
          lastStaff: lastScan.staff,
          otherGate: !sameGate && Boolean(lastScan.gate && gateLabel),
        }),
      );
    }

    // Every seat already came through today. The next day on this pass is still usable.
    if (entriesToday >= seats) {
      const lastScan = await lastScanAt(conn, booking.id);
      const time = String(lastScan.at || used[0].last_at).slice(11, 16);
      const sameGate = isSameGate(lastScan.gate, gateLabel);
      const daysLeft = Math.max(0, daysAllowed - daysUsed);
      throw new HttpError(
        409,
        `${seats === 1 ? 'The one seat on this booking has' : `All ${seats} seats on this booking have`} already entered today${
          time ? ` (last entry at ${time})` : ''
        }. ${whereScanned(lastScan, sameGate)}${
          daysLeft > 0
            ? `${daysLeft} more event ${daysLeft === 1 ? 'day is' : 'days are'} open on later dates.`
            : 'No event days remain.'
        }`,
        denialDetails(booking, {
          reason: 'already_scanned',
          validFrom: startDate,
          validTo: endDate,
          passDays: daysAllowed,
          entriesAllowed: totalEntriesAllowed,
          entriesUsed,
          entriesLeft,
          entriesToday,
          entriesTodayAllowed: seats,
          entriesTodayLeft: 0,
          daysUsed,
          daysAllowed,
          dayNumber,
          calendarDays,
          lastEntryDate: today,
          lastEntryAt: lastScan.at || used[0].last_at,
          lastGate: lastScan.gate,
          lastStaff: lastScan.staff,
          otherGate: !sameGate && Boolean(lastScan.gate && gateLabel),
        }),
      );
    }

    const roster = attendeeList(booking.attendees_json);
    const [namedRows] = await conn.execute(
      `SELECT attendee_position FROM event_booking_checkins
        WHERE booking_id = ? AND entry_date = ? AND attendee_position IS NOT NULL`,
      [booking.id, today],
    );
    const enteredPositions = new Set(namedRows.map((row) => Number(row.attendee_position)));
    const seatsLeftToday = seats - entriesToday;
    let admittedPositions;

    if (wanted) {
      const onPass = new Set(roster.map((att) => Number(att.position)));
      const foreign = wanted.filter((position) => !onPass.has(position));
      if (foreign.length) {
        throw new HttpError(409, `Number ${foreign.join(', ')} is not a name on this pass.`, denialDetails(booking, {
          reason: 'unknown_attendee',
          entriesToday,
          entriesTodayAllowed: seats,
          entriesTodayLeft: seatsLeftToday,
        }));
      }
      const repeated = wanted.filter((position) => enteredPositions.has(position));
      if (repeated.length) {
        const who = repeated.map(
          (position) => roster.find((att) => Number(att.position) === position)?.name || `#${position}`,
        );
        throw new HttpError(409, `${who.join(', ')} already entered today on this pass.`, denialDetails(booking, {
          reason: 'already_scanned',
          entriesToday,
          entriesTodayAllowed: seats,
          entriesTodayLeft: seatsLeftToday,
          repeatedNames: who,
        }));
      }
      if (wanted.length > seatsLeftToday) {
        throw new HttpError(
          409,
          `Only ${seatsLeftToday} ${seatsLeftToday === 1 ? 'seat is' : 'seats are'} still open today.`,
          denialDetails(booking, {
            reason: 'already_scanned',
            entriesToday,
            entriesTodayAllowed: seats,
            entriesTodayLeft: seatsLeftToday,
          }),
        );
      }
      admittedPositions = wanted;
    } else {
      // A plain scan admits one seat and claims the first name that has not entered yet.
      const next = roster.map((att) => Number(att.position)).find((position) => !enteredPositions.has(position));
      admittedPositions = [next ?? null];
    }

    const admittedCount = admittedPositions.length;
    for (const position of admittedPositions) {
      await conn.execute(
        `INSERT INTO event_booking_checkins (booking_id, entry_date, checked_in_by, gate, client_scan_id, attendee_position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [booking.id, today, actor.id, gateLabel, clientScanId || null, position],
      );
    }
    for (const position of admittedPositions) if (position !== null) enteredPositions.add(position);

    await conn.execute(
      `UPDATE event_bookings
       SET check_in_at = COALESCE(check_in_at, NOW()),
           checked_in_by = COALESCE(checked_in_by, ?)
       WHERE id = ?`,
      [actor.id, booking.id],
    );

    const entriesTodayAfter = entriesToday + admittedCount;
    const entriesUsedAfter = entriesUsed + admittedCount;
    const daysUsedAfter = entriesToday > 0 ? daysUsed : daysUsed + 1;

    // A live code is spent only when today's last seat has walked in, so the same
    // 60-second code can admit the rest of the group.
    if (liveCodeRow && entriesTodayAfter >= seats) {
      await conn.execute(
        'UPDATE event_pass_codes SET used_at = NOW(), used_gate = ? WHERE id = ?',
        [gateLabel, liveCodeRow.id],
      );
    }

      return {
        ...booking,
        check_in_at: 'now',
        entryDate: today,
        gate: gateLabel,
        liveCode: Boolean(live),
        admittedPositions,
        admittedCount,
        enteredPositions: [...enteredPositions],
        dayNumber,
        calendarDays,
        daysAllowed,
        seats,
        daysUsed: daysUsedAfter,
        entriesToday: entriesTodayAfter,
        entriesUsed: entriesUsedAfter,
        entriesAllowed: totalEntriesAllowed,
        entriesLeft: Math.max(0, totalEntriesAllowed - entriesUsedAfter),
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
      mode: offlineSync ? 'offline_sync' : result.liveCode ? 'live_qr' : isToken(value) ? 'qr' : 'reference',
      gate: result.gate,
      entryDate: result.entryDate,
      admittedCount: result.admittedCount,
      attendeePositions: result.admittedPositions,
      dayNumber: result.dayNumber,
      seats: result.seats,
      entriesToday: result.entriesToday,
      daysUsed: result.daysUsed,
      entriesUsed: result.entriesUsed,
      entriesAllowed: result.entriesAllowed,
      ...(offlineSync ? { offline: true, clientScanId } : {}),
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
    passDays: result.daysAllowed,
    gate: result.gate,
    liveCode: result.liveCode,
    validFrom: isoDate(result.event_date),
    validTo: isoDate(result.end_date || result.event_date),
    attendees: attendeeList(result.attendees_json).map((att) => ({
      ...att,
      enteredToday: result.enteredPositions.includes(Number(att.position)),
    })),
    admittedPositions: result.admittedPositions.filter((position) => position !== null),
    admittedCount: result.admittedCount,
    status: result.status,
    checkedInAt: new Date().toISOString(),
    checkIn: {
      entryDate: result.entryDate,
      dayNumber: result.dayNumber,
      calendarDays: result.calendarDays,
      seats: result.seats,
      entriesToday: result.entriesToday,
      entriesTodayAllowed: result.seats,
      entriesTodayLeft: Math.max(0, result.seats - result.entriesToday),
      daysUsed: result.daysUsed,
      daysAllowed: result.daysAllowed,
      daysLeft: Math.max(0, result.daysAllowed - result.daysUsed),
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
