import { query, withTransaction } from '../db.js';
import { HttpError, makeQrToken } from './util.js';
import { sendPassEmail } from './mailer.js';
import { audit } from './auth.js';
import { attendeeEmails } from './attendees.js';

export const PASS_SELECT = `
  SELECT b.id, b.reference, b.name, b.email, b.phone, b.qty, b.pass_days, b.unit_price, b.amount, b.status,
         b.source, b.guest_category, b.coupon_code, b.discount_amount, b.gross_amount, b.admin_note,
         b.otp_verified_at, b.qr_token, b.pass_sent_at, b.check_in_at, b.created_at,
         (SELECT MAX(ci.created_at) FROM event_booking_checkins ci
           WHERE ci.booking_id = b.id AND ci.entry_date = CURDATE()) AS today_check_in_at,
         (SELECT COUNT(*) FROM event_booking_checkins ci WHERE ci.booking_id = b.id) AS check_in_count,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', a.position, 'name', a.name, 'phone', a.phone, 'email', a.email))
            FROM event_booking_attendees a WHERE a.booking_id = b.id) AS attendees_json,
         e.id AS event_id, e.slug AS event_slug, e.kind, e.name_en AS event_name_en, e.name_hi AS event_name_hi,
         e.date_label_en, e.date_label_hi,
         tt.id AS ticket_type_id, tt.slug AS ticket_slug, tt.name_en AS ticket_name_en, tt.name_hi AS ticket_name_hi,
         s.id AS schedule_id, s.event_date, s.end_date, s.start_time, s.end_time, s.note_en, s.note_hi,
         GREATEST(1, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1) AS schedule_days,
         st.id AS state_id, st.name_en AS state_name_en, st.name_hi AS state_name_hi,
         c.id AS city_id, c.name_en AS city_name_en, c.name_hi AS city_name_hi,
         v.id AS venue_id, v.name_en AS venue_name_en, v.name_hi AS venue_name_hi,
         v.address_en, v.address_hi, v.map_url
  FROM event_bookings b
  JOIN events e ON e.id = b.event_id
  JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
  JOIN event_schedules s ON s.id = b.schedule_id
  JOIN event_states st ON st.id = s.state_id
  JOIN event_cities c ON c.id = s.city_id
  JOIN event_venues v ON v.id = s.venue_id
`;

export async function loadBookingById(id) {
  const [row] = await query(`${PASS_SELECT} WHERE b.id = ? LIMIT 1`, [id]);
  return row ?? null;
}

export async function loadBookingByReference(reference) {
  const [row] = await query(`${PASS_SELECT} WHERE b.reference = ? LIMIT 1`, [reference]);
  return row ?? null;
}

export function bookingMapUrl(row) {
  if (!row) return null;
  if (row.map_url) return row.map_url;
  const parts = [row.venue_name_en, row.address_en, row.city_name_en, row.state_name_en].filter(Boolean);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

export function publicPass(row) {
  if (!row) return null;
  const calendarDays = Math.max(1, Number(row.schedule_days) || 1);
  const passDays = Math.max(1, Math.min(Number(row.pass_days) || 1, calendarDays));
  return {
    reference: row.reference,
    name: row.name,
    email: row.email,
    phone: row.phone,
    qty: Number(row.qty),
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    status: row.status,
    qrToken: row.status === 'paid' ? row.qr_token : null,
    checkInAt: row.check_in_at,
    todayCheckInAt: row.today_check_in_at || null,
    checkInCount: Number(row.check_in_count || 0),
    passDays,
    calendarDays,
    entriesLeft: Math.max(0, passDays - Number(row.check_in_count || 0)),
    createdAt: row.created_at,
    source: row.source || 'online',
    guestCategory: row.guest_category || 'visitor',
    couponCode: row.coupon_code || null,
    discount: Number(row.discount_amount || 0),
    grossAmount: row.gross_amount == null ? null : Number(row.gross_amount),
    adminNote: row.admin_note || null,
    attendees: attendeeList(row.attendees_json),
    event: {
      slug: row.event_slug,
      kind: row.kind,
      name_en: row.event_name_en,
      name_hi: row.event_name_hi,
      date_label_en: row.date_label_en,
      date_label_hi: row.date_label_hi,
    },
    ticket: {
      slug: row.ticket_slug,
      name_en: row.ticket_name_en,
      name_hi: row.ticket_name_hi,
    },
    schedule: {
      id: row.schedule_id,
      event_date: row.event_date,
      end_date: row.end_date,
      start_time: row.start_time,
      end_time: row.end_time,
      note_en: row.note_en,
      note_hi: row.note_hi,
    },
    location: {
      state_id: row.state_id,
      city_id: row.city_id,
      venue_id: row.venue_id,
      state_en: row.state_name_en,
      state_hi: row.state_name_hi,
      city_en: row.city_name_en,
      city_hi: row.city_name_hi,
      venue_en: row.venue_name_en,
      venue_hi: row.venue_name_hi,
      address_en: row.address_en,
      address_hi: row.address_hi,
      mapUrl: bookingMapUrl(row),
    },
  };
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

export async function soldBySchedule() {
  const rows = await query(
    `SELECT schedule_id, ticket_type_id, COALESCE(SUM(qty), 0) AS sold
     FROM event_bookings
     WHERE status = 'paid' OR (status = 'pending' AND created_at > NOW() - INTERVAL 30 MINUTE)
     GROUP BY schedule_id, ticket_type_id`,
  );
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.schedule_id}:${row.ticket_type_id}`, Number(row.sold));
  }
  return map;
}

/**
 * Marks a pending booking paid, issues the QR token, records the payment and emails the pass.
 * Safe to call twice (webhook retries): the QR token is issued once.
 */
export async function activateBooking({
  bookingId,
  provider = 'dev',
  providerRef = null,
  raw = null,
  ip = null,
  actorId = null,
  note = null,
}) {
  const outcome = await withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, reference, status, qr_token, amount FROM event_bookings WHERE id = ? FOR UPDATE`,
      [bookingId],
    );
    const booking = rows[0];
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status === 'paid') return { already: true, booking };
    if (booking.status !== 'pending') throw new HttpError(409, 'This booking can no longer be paid.');

    const qrToken = makeQrToken();
    await conn.execute(
      `UPDATE event_bookings
       SET status = 'paid', qr_token = ?, otp_verified_at = COALESCE(otp_verified_at, NOW())
       WHERE id = ?`,
      [qrToken, bookingId],
    );

    const [paymentRows] = await conn.execute(
      'SELECT id FROM event_payments WHERE booking_id = ? ORDER BY id DESC LIMIT 1',
      [bookingId],
    );
    if (paymentRows[0]) {
      await conn.execute(
        `UPDATE event_payments SET provider = ?, provider_ref = ?, status = 'captured', raw = ? WHERE id = ?`,
        [provider, providerRef, raw ? JSON.stringify(raw) : null, paymentRows[0].id],
      );
    } else {
      await conn.execute(
        `INSERT INTO event_payments (booking_id, provider, provider_ref, amount, status, raw)
         VALUES (?, ?, ?, ?, 'captured', ?)`,
        [bookingId, provider, providerRef, booking.amount, raw ? JSON.stringify(raw) : null],
      );
    }

    return { already: false, booking: { ...booking, qr_token: qrToken } };
  });

  const row = await loadBookingById(bookingId);
  const pass = publicPass(row);

  if (!outcome.already) {
    const passFields = {
      reference: row.reference,
      eventName: row.event_name_en,
      ticketName: row.ticket_name_en,
      venue: row.venue_name_en,
      address: row.address_en,
      city: row.city_name_en,
      state: row.state_name_en,
      dateLabel: row.date_label_en,
      mapUrl: bookingMapUrl(row),
      qty: Number(row.qty),
      amount: Number(row.amount),
      qrToken: row.qr_token,
      passDays: pass.passDays,
      bookingId,
      note,
    };
    try {
      const delivery = await sendPassEmail({ to: row.email, name: row.name, ...passFields });
      // Every named attendee with an email gets the same QR, so one person does not have to forward it.
      for (const attendee of attendeeEmails(pass.attendees, row.email)) {
        await sendPassEmail({ to: attendee.email, name: attendee.name, ...passFields });
      }
      if (delivery.delivered) {
        await query('UPDATE event_bookings SET pass_sent_at = NOW() WHERE id = ?', [bookingId]);
      }
    } catch (err) {
      console.error(`[pass-email] ${row.reference}:`, err.message);
    }

    await audit({
      actorType: actorId ? 'admin' : 'public',
      actorId,
      action: 'event.payment.captured',
      entity: 'event_booking',
      entityId: String(bookingId),
      meta: { amount: Number(row.amount), provider, reference: row.reference },
      ip,
    });
  }

  return pass;
}
