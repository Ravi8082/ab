import { query } from '../db.js';

/**
 * Replaces the attendee roster for a booking. Position 1 is the buyer, so the roster always
 * matches qty and a re-submit cannot leave stale rows behind.
 */
export async function replaceAttendees(conn, bookingId, attendees) {
  await conn.execute('DELETE FROM event_booking_attendees WHERE booking_id = ?', [bookingId]);
  for (const [index, person] of attendees.entries()) {
    await conn.execute(
      `INSERT INTO event_booking_attendees (booking_id, position, name, phone, email)
       VALUES (?, ?, ?, ?, ?)`,
      [bookingId, index + 1, person.name, person.phone, person.email || null],
    );
  }
}

export async function listAttendees(bookingId) {
  return query(
    `SELECT position, name, phone, email
     FROM event_booking_attendees WHERE booking_id = ? ORDER BY position`,
    [bookingId],
  );
}

/** Extra destinations for the pass mail, so every named attendee can be sent their own copy. */
export function attendeeEmails(attendees, buyerEmail) {
  const buyer = String(buyerEmail || '').toLowerCase();
  const seen = new Set([buyer]);
  const out = [];
  for (const person of attendees) {
    const email = String(person.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: person.name });
  }
  return out;
}
