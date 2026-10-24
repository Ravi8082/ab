import { query } from '../db.js';
import { HttpError } from './util.js';

export function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 32);
}

export function discountFor(kind, value, gross) {
  const total = Math.max(0, Math.round(Number(gross) || 0));
  if (kind === 'percent') {
    const pct = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    return Math.min(total, Math.round((total * pct) / 100));
  }
  return Math.min(total, Math.max(0, Math.round(Number(value) || 0)));
}

/**
 * Locks and validates a coupon inside the booking transaction so usage limits cannot be raced.
 * Throws 400 with a field error the drawer can show next to the code box.
 */
export async function redeemCoupon(conn, { code, email, eventId, ticketTypeId, qty, gross }) {
  const normalized = normalizeCode(code);
  const fieldError = (message) => new HttpError(400, message, { couponCode: message });

  const [rows] = await conn.execute('SELECT * FROM event_coupons WHERE code = ? FOR UPDATE', [normalized]);
  const coupon = rows[0];
  if (!coupon) throw fieldError('This coupon code is not valid.');
  if (!Number(coupon.active)) throw fieldError('This coupon is no longer active.');

  const [windowRows] = await conn.execute(
    `SELECT (valid_from IS NULL OR valid_from <= CURDATE()) AS started,
            (valid_until IS NULL OR valid_until >= CURDATE()) AS unexpired
     FROM event_coupons WHERE id = ?`,
    [coupon.id],
  );
  if (!Number(windowRows[0].started)) throw fieldError('This coupon is not active yet.');
  if (!Number(windowRows[0].unexpired)) throw fieldError('This coupon has expired.');

  if (coupon.event_id && Number(coupon.event_id) !== Number(eventId)) {
    throw fieldError('This coupon cannot be used for this event.');
  }
  if (coupon.ticket_type_id && Number(coupon.ticket_type_id) !== Number(ticketTypeId)) {
    throw fieldError('This coupon cannot be used for this pass type.');
  }
  if (Number(qty) < Number(coupon.min_qty || 1)) {
    throw fieldError(`Add at least ${Number(coupon.min_qty)} people to use this coupon.`);
  }

  if (coupon.max_uses != null) {
    const [used] = await conn.execute(
      'SELECT COUNT(*) AS n FROM event_coupon_uses WHERE coupon_id = ?',
      [coupon.id],
    );
    if (Number(used[0].n) >= Number(coupon.max_uses)) throw fieldError('This coupon has already been fully used.');
  }

  const perEmail = Number(coupon.per_email_limit || 0);
  if (perEmail > 0) {
    const [used] = await conn.execute(
      'SELECT COUNT(*) AS n FROM event_coupon_uses WHERE coupon_id = ? AND email = ?',
      [coupon.id, email.toLowerCase()],
    );
    if (Number(used[0].n) >= perEmail) {
      throw fieldError('You have already used this coupon the allowed number of times.');
    }
  }

  const amountOff = discountFor(coupon.kind, coupon.value, gross);
  if (amountOff <= 0) throw fieldError('This coupon gives no discount on the selected pass.');

  return {
    couponId: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    value: Number(coupon.value),
    amountOff,
    label_en: coupon.label_en,
    label_hi: coupon.label_hi,
  };
}

export async function recordCouponUse(conn, { couponId, bookingId, email, amountOff }) {
  await conn.execute(
    `INSERT INTO event_coupon_uses (coupon_id, booking_id, email, amount_off) VALUES (?, ?, ?, ?)`,
    [couponId, bookingId, email.toLowerCase(), amountOff],
  );
}

/** Read-only check used by the drawer's "Apply" button — no lock, no spend. */
export async function previewCoupon({ code, email, eventId, ticketTypeId, qty, gross }) {
  const normalized = normalizeCode(code);
  const coupon = await query(
    `SELECT id, code, kind, value, label_en, label_hi, min_qty, active, max_uses, per_email_limit,
            event_id, ticket_type_id,
            (valid_from IS NULL OR valid_from <= CURDATE()) AS started,
            (valid_until IS NULL OR valid_until >= CURDATE()) AS unexpired
     FROM event_coupons WHERE code = ? LIMIT 1`,
    [normalized],
  );
  const row = coupon[0];
  if (!row) return { ok: false, message: 'This coupon code is not valid.' };
  if (!Number(row.active)) return { ok: false, message: 'This coupon is no longer active.' };
  if (!Number(row.started)) return { ok: false, message: 'This coupon is not active yet.' };
  if (!Number(row.unexpired)) return { ok: false, message: 'This coupon has expired.' };
  if (row.event_id && Number(row.event_id) !== Number(eventId)) {
    return { ok: false, message: 'This coupon cannot be used for this event.' };
  }
  if (row.ticket_type_id && Number(row.ticket_type_id) !== Number(ticketTypeId)) {
    return { ok: false, message: 'This coupon cannot be used for this pass type.' };
  }
  if (Number(qty) < Number(row.min_qty || 1)) {
    return { ok: false, message: `Add at least ${Number(row.min_qty)} people to use this coupon.` };
  }

  const [uses] = await query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN email = ? THEN 1 ELSE 0 END) AS by_email
     FROM event_coupon_uses WHERE coupon_id = ?`,
    [String(email || '').toLowerCase(), row.id],
  );
  if (row.max_uses != null && Number(uses.total || 0) >= Number(row.max_uses)) {
    return { ok: false, message: 'This coupon has already been fully used.' };
  }
  const perEmail = Number(row.per_email_limit || 0);
  if (perEmail > 0 && Number(uses.by_email || 0) >= perEmail) {
    return { ok: false, message: 'You have already used this coupon the allowed number of times.' };
  }

  const amountOff = discountFor(row.kind, row.value, gross);
  if (amountOff <= 0) return { ok: false, message: 'This coupon gives no discount on the selected pass.' };
  return {
    ok: true,
    code: row.code,
    amountOff,
    netAmount: Math.max(0, Math.round(Number(gross) || 0) - amountOff),
    label_en: row.label_en,
    label_hi: row.label_hi,
  };
}
