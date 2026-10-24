import { query } from '../db.js';
import { audit } from './auth.js';
import { HttpError } from './util.js';

const BLOCK_SELECT = `b.id, b.booking_id, b.email, b.phone, b.name, b.reason, b.scope, b.event_id, b.active,
       b.created_at, b.blocked_by, a.name AS blocked_by_name, e.name_en AS event_name_en`;

const FROM_BLOCK = `FROM event_entry_blocks b
  LEFT JOIN admins a ON a.id = b.blocked_by
  LEFT JOIN events e ON e.id = b.event_id`;

const BLOCK_WHERE = `b.active = 1
       AND (b.scope = 'all_events' OR b.event_id IS NULL OR b.event_id = ?)
       AND (
         (b.booking_id IS NOT NULL AND b.booking_id = ?)
         OR (b.email IS NOT NULL AND b.email = ?)
         OR (b.phone IS NOT NULL AND b.phone = ?)
       )`;

const BLOCK_PARAMS = ({ bookingId, email, phone, eventId }) => [
  eventId ?? 0,
  bookingId ?? 0,
  String(email || '').toLowerCase(),
  String(phone || ''),
];

/** Gate check-in looks the block up on its own connection so the answer cannot race an admin revoke. */
export async function findActiveBlockOn(conn, target) {
  const [rows] = await conn.execute(
    `SELECT ${BLOCK_SELECT} ${FROM_BLOCK} WHERE ${BLOCK_WHERE} ORDER BY b.id DESC LIMIT 1`,
    BLOCK_PARAMS(target),
  );
  return rows[0] ?? null;
}

/**
 * A blocked person is refused even when their QR is valid and paid. Matching is on the booking,
 * the email or the mobile number, so re-booking under the same contact does not undo a block.
 */
export async function findActiveBlock(target) {
  const rows = await query(
    `SELECT ${BLOCK_SELECT} ${FROM_BLOCK} WHERE ${BLOCK_WHERE} ORDER BY b.id DESC LIMIT 1`,
    BLOCK_PARAMS(target),
  );
  return rows[0] ?? null;
}

export async function createBlock(
  { bookingId = null, email = null, phone = null, name = null, reason, scope = 'all_events', eventId = null },
  { actorId, ip },
) {
  if (!bookingId && !email && !phone) {
    throw new HttpError(400, 'Give the booking reference, email or mobile number to block.');
  }
  const result = await query(
    `INSERT INTO event_entry_blocks (booking_id, email, phone, name, reason, scope, event_id, active, blocked_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      bookingId,
      email ? String(email).trim().toLowerCase() : null,
      phone ? String(phone).trim() : null,
      name ? String(name).trim().slice(0, 120) : null,
      String(reason).trim().slice(0, 255),
      scope === 'event' ? 'event' : 'all_events',
      scope === 'event' ? eventId : null,
      actorId,
    ],
  );
  const [row] = await query(`SELECT ${BLOCK_SELECT} ${FROM_BLOCK} WHERE b.id = ?`, [result.insertId]);
  await audit({
    actorType: 'admin',
    actorId,
    action: 'event.block.created',
    entity: 'event_entry_block',
    entityId: String(result.insertId),
    meta: { email: row.email, phone: row.phone, bookingId: row.booking_id, reason: row.reason, scope: row.scope },
    ip,
  });
  return row;
}

export async function setBlockActive(id, active, { actorId, ip }) {
  const [row] = await query(
    'SELECT id, email, phone, booking_id, reason, active FROM event_entry_blocks WHERE id = ? LIMIT 1',
    [id],
  );
  if (!row) throw new HttpError(404, 'That block entry no longer exists.');
  await query('UPDATE event_entry_blocks SET active = ? WHERE id = ?', [active ? 1 : 0, id]);
  await audit({
    actorType: 'admin',
    actorId,
    action: active ? 'event.block.revoked' : 'event.block.reinstated',
    entity: 'event_entry_block',
    entityId: String(id),
    meta: { email: row.email, phone: row.phone, reason: row.reason },
    ip,
  });
  const [fresh] = await query(`SELECT ${BLOCK_SELECT} ${FROM_BLOCK} WHERE b.id = ?`, [id]);
  return fresh;
}

export async function listBlocks({ includeRevoked = false, search = null } = {}) {
  const args = [];
  let where = '1=1';
  if (!includeRevoked) where += ' AND b.active = 1';
  if (search) {
    where += ' AND (b.email LIKE ? OR b.phone LIKE ? OR b.name LIKE ? OR b.reason LIKE ?)';
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  return query(`SELECT ${BLOCK_SELECT} ${FROM_BLOCK} WHERE ${where} ORDER BY b.id DESC LIMIT 300`, args);
}
