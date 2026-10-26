import crypto from 'node:crypto';
import { query } from '../db.js';
import { HttpError } from './util.js';

export const LIVE_CODE_TTL_SECONDS = 60;

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const LIVE_PREFIX = 'ABDYN';

function randomCode(length = 10) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** A live code is `ABDYN-<reference>-<10 chars>`; anything else is the printed pass QR. */
export function parseLiveCode(value) {
  const match = /^ABDYN-([A-Z0-9-]{8,19})-([A-Z0-9]{10})$/i.exec(String(value || '').trim());
  if (!match) return null;
  const reference = match[1].toUpperCase();
  if (!/^AB[A-Z0-9-]{4,18}$/.test(reference)) return null;
  return { reference, code: match[2].toUpperCase() };
}

export function liveCodeFor(reference, code) {
  return `${LIVE_PREFIX}-${reference}-${code}`;
}

/**
 * Issues a 60-second code for one booking. A single-seat pass keeps only the newest code usable,
 * so a screenshot stops working as soon as the devotee's screen refreshes. Group passes keep
 * older codes alive for the 60 seconds so every attendee's screen can show a working code.
 */
export async function issuePassCode({ reference, contact, ip }) {
  const ref = String(reference || '').trim().toUpperCase();
  const who = String(contact || '').trim().toLowerCase();
  if (!ref || !who) throw new HttpError(400, 'Enter the booking reference and the email used for it.');

  const [booking] = await query(
    `SELECT id, reference, email, phone, status, qty FROM event_bookings WHERE reference = ? LIMIT 1`,
    [ref],
  );
  if (!booking) throw new HttpError(404, 'Booking not found.');
  const phone = String(booking.phone || '').replace(/\D/g, '');
  if (String(booking.email || '').toLowerCase() !== who && phone !== who.replace(/\D/g, '')) {
    throw new HttpError(403, 'These details do not match this booking.');
  }
  if (booking.status !== 'paid') {
    throw new HttpError(409, 'The live gate QR is issued only for paid passes.');
  }

  // One person's screen refresh must not kill the code another attendee is showing for a
  // group booking, so only single-seat passes keep the strict screen-only rule.
  if (Number(booking.qty) <= 1) {
    await query(
      `UPDATE event_pass_codes SET used_at = NOW(), used_gate = 'superseded'
        WHERE booking_id = ? AND used_at IS NULL`,
      [booking.id],
    );
  }

  let code = randomCode(10);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await query(
        `INSERT INTO event_pass_codes (booking_id, code, expires_at, created_ip)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
        [booking.id, code, LIVE_CODE_TTL_SECONDS, ip ?? null],
      );
      break;
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY' || attempt === 2) throw err;
      code = randomCode(10);
    }
  }

  return {
    code: liveCodeFor(booking.reference, code),
    ttlSeconds: LIVE_CODE_TTL_SECONDS,
    expiresAt: new Date(Date.now() + LIVE_CODE_TTL_SECONDS * 1000).toISOString(),
  };
}
