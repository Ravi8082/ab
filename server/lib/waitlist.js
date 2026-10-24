import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, makeWaitlistRef } from './util.js';
import { sendWaitlistOtpEmail } from './mailer.js';

const MAX_ATTEMPTS = 5;

export async function loadWaitlistState(stateId) {
  const [state] = await query(
    'SELECT id, code, name_en, name_hi FROM event_states WHERE id = ? AND active = 1 LIMIT 1',
    [stateId],
  );
  if (!state) throw new HttpError(404, 'Choose a valid state.');

  const [openRow] = await query(
    `SELECT COUNT(*) AS n FROM event_schedules s
     JOIN events e ON e.id = s.event_id AND e.active = 1 AND e.kind = 'yatra'
     WHERE s.state_id = ? AND s.active = 1 AND s.event_date >= CURDATE()`,
    [state.id],
  );
  if (Number(openRow.n) > 0) {
    throw new HttpError(409, 'The yatra is already scheduled in this state — choose your city instead.');
  }
  return state;
}

async function issueCode(entry, stateName) {
  const recent = await query(
    `SELECT id FROM event_waitlist_otps
     WHERE waitlist_id = ? AND consumed_at IS NULL AND created_at > NOW() - INTERVAL 45 SECOND
     LIMIT 1`,
    [entry.id],
  );
  if (recent.length > 0) throw new HttpError(429, 'Please wait a moment before asking for another code.');

  const code = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(code, 10);
  await query(
    `INSERT INTO event_waitlist_otps (waitlist_id, code_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [entry.id, hash],
  );
  const sent = await sendWaitlistOtpEmail({
    to: entry.email,
    code,
    stateName,
    reference: entry.ref,
  });

  return {
    delivered: sent.delivered,
    devMode: config.otpDevMode,
    devCode: config.otpDevMode ? code : undefined,
  };
}

export async function joinWaitlist({ stateId, name, email, phone }) {
  const state = await loadWaitlistState(stateId);
  const normalized = email.toLowerCase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await query(
        `INSERT INTO event_state_waitlist (ref, state_id, name, email, phone)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone)`,
        [makeWaitlistRef(), state.id, name, normalized, phone || null],
      );
      break;
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY') throw err;
    }
  }

  const [entry] = await query(
    'SELECT id, ref, status, email FROM event_state_waitlist WHERE state_id = ? AND email = ? LIMIT 1',
    [state.id, normalized],
  );
  if (!entry) throw new HttpError(500, 'Could not save your request. Please try again.');
  if (entry.status === 'verified') return { entry, state, alreadyVerified: true };

  const codes = await issueCode(entry, state.name_en);
  return { entry, state, alreadyVerified: false, ...codes };
}

async function findWaitlist(ref) {
  const [entry] = await query(
    `SELECT w.id, w.ref, w.status, w.email, s.id AS state_id, s.name_en, s.name_hi
     FROM event_state_waitlist w JOIN event_states s ON s.id = w.state_id
     WHERE w.ref = ? LIMIT 1`,
    [ref],
  );
  if (!entry) throw new HttpError(404, 'We could not find that request.');
  return entry;
}

export async function resendWaitlistCode(ref) {
  const entry = await findWaitlist(ref);
  if (entry.status === 'verified') return { entry, alreadyVerified: true };
  const codes = await issueCode(entry, entry.name_en);
  return { entry, alreadyVerified: false, ...codes };
}

export async function verifyWaitlistCode(ref, code) {
  const entry = await findWaitlist(ref);
  if (entry.status === 'verified') return { verified: true, already: true };

  const [otp] = await query(
    `SELECT id, code_hash, attempts FROM event_waitlist_otps
     WHERE waitlist_id = ? AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [entry.id],
  );
  if (!otp) throw new HttpError(400, 'That code has expired. Request a new one.');
  if (Number(otp.attempts) >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong attempts. Request a new code.');

  const ok = await bcrypt.compare(code, otp.code_hash);
  if (!ok) {
    await query('UPDATE event_waitlist_otps SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
    throw new HttpError(400, 'Incorrect code.');
  }

  await query('UPDATE event_waitlist_otps SET consumed_at = NOW() WHERE id = ?', [otp.id]);
  await query("UPDATE event_state_waitlist SET status = 'verified', verified_at = NOW() WHERE id = ?", [entry.id]);
  return { verified: true, already: false };
}
