import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, asyncHandler } from '../lib/util.js';
import { audit, clientIp, requireAdmin, requireRole } from '../lib/auth.js';
import { checkInBooking } from '../lib/checkin.js';
import { getGateSettings } from '../lib/settings.js';

export const staffRouter = Router();

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Every gate at a venue shares one public IP, so throttle per staff account.
  keyGenerator: (req) => (req.admin ? `staff-${req.admin.id}` : req.ip),
  message: { error: 'Too many scans. Take a breath and try again.' },
});

const offlineSyncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.admin ? `offline-${req.admin.id}` : req.ip),
  message: { error: 'Too many sync attempts. The queue will retry shortly.' },
});

const scanSchema = z.object({
  code: z.string().trim().min(3).max(40),
  gate: z.string().trim().max(60).optional(),
  positions: z.array(z.number().int().min(1).max(500)).max(200).optional(),
});

const offlineScanSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/),
  code: z.string().trim().min(3).max(40),
  gate: z.string().trim().max(60).optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scannedAt: z.string().datetime({ offset: true }).optional(),
});

const offlineSyncSchema = z.object({
  scans: z.array(offlineScanSchema).min(1).max(100),
});

const isoDate = (value) => String(value || '').slice(0, 10);

function attendeesOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

staffRouter.use(requireAdmin);
staffRouter.use(requireRole('owner', 'manager', 'staff'));

staffRouter.get('/me', (req, res) => {
  res.json({ staff: req.admin });
});

/**
 * A compact snapshot of every pass that can enter today (and tomorrow, for shifts
 * that run past midnight), so the scanner keeps working when venue internet drops.
 * Live rotating codes are deliberately not included — those are verified server-side only.
 */
staffRouter.get(
  '/offline-pack',
  asyncHandler(async (req, res) => {
    const [rows, blocks, gateSettings, todayRows] = await Promise.all([
      query(
        `SELECT b.id, b.reference, b.qr_token, b.name, b.email, b.phone, b.qty, b.pass_days, b.amount,
                b.status, b.source, b.guest_category,
                e.id AS event_id, e.name_en AS event_name_en, e.name_hi AS event_name_hi, e.kind,
                tt.name_en AS ticket_name_en, tt.name_hi AS ticket_name_hi,
                s.event_date, s.end_date, s.start_time, s.end_time,
                st.name_en AS state_en, st.name_hi AS state_hi,
                c.name_en AS city_en, c.name_hi AS city_hi,
                v.name_en AS venue_en, v.name_hi AS venue_hi, v.address_en, v.address_hi,
                (SELECT JSON_ARRAYAGG(JSON_OBJECT('position', att.position, 'name', att.name, 'phone', att.phone))
                   FROM event_booking_attendees att WHERE att.booking_id = b.id) AS attendees_json,
                COALESCE(ci.entries, 0) AS entries_used,
                COALESCE(ci.days_used, 0) AS days_used,
                COALESCE(ci.today_entries, 0) AS entries_today,
                ci.last_day, ci.last_at,
                (SELECT c2.gate FROM event_booking_checkins c2 WHERE c2.booking_id = b.id
                  ORDER BY c2.entry_date DESC, c2.created_at DESC, c2.id DESC LIMIT 1) AS last_gate,
                (SELECT a2.name FROM event_booking_checkins c3
                  LEFT JOIN admins a2 ON a2.id = c3.checked_in_by
                  WHERE c3.booking_id = b.id
                  ORDER BY c3.entry_date DESC, c3.created_at DESC, c3.id DESC LIMIT 1) AS last_staff
         FROM event_bookings b
         JOIN events e ON e.id = b.event_id
         JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
         JOIN event_schedules s ON s.id = b.schedule_id
         JOIN event_states st ON st.id = s.state_id
         JOIN event_cities c ON c.id = s.city_id
         JOIN event_venues v ON v.id = s.venue_id
         LEFT JOIN (
           SELECT booking_id, COUNT(*) AS entries,
                  COUNT(DISTINCT entry_date) AS days_used,
                  SUM(entry_date = CURDATE()) AS today_entries,
                  MAX(entry_date) AS last_day,
                  MAX(created_at) AS last_at
           FROM event_booking_checkins GROUP BY booking_id
         ) ci ON ci.booking_id = b.id
         WHERE b.status = 'paid'
           AND s.event_date <= CURDATE() + INTERVAL 1 DAY
           AND COALESCE(s.end_date, s.event_date) >= CURDATE()
         ORDER BY b.id
         LIMIT 20000`,
      ),
      query(
        `SELECT b.booking_id, b.email, b.phone, b.scope, b.event_id, b.reason,
                a.name AS blocked_by_name
         FROM event_entry_blocks b
         LEFT JOIN admins a ON a.id = b.blocked_by
         WHERE b.active = 1
         ORDER BY b.id DESC
         LIMIT 2000`,
      ),
      getGateSettings(),
      query('SELECT CURDATE() AS today'),
    ]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      serverDate: isoDate(todayRows[0]?.today),
      staff: { id: req.admin.id, name: req.admin.name },
      liveQrOnly: Boolean(gateSettings.live_qr_only),
      bookings: rows.map((row) => ({
        id: Number(row.id),
        reference: row.reference,
        qrToken: row.qr_token,
        name: row.name,
        email: row.email,
        phone: row.phone,
        qty: Number(row.qty),
        passDays: Number(row.pass_days || 1),
        amount: Number(row.amount),
        status: row.status,
        source: row.source,
        guestCategory: row.guest_category,
        event: {
          id: Number(row.event_id),
          name_en: row.event_name_en,
          name_hi: row.event_name_hi,
          kind: row.kind,
        },
        ticket: { name_en: row.ticket_name_en, name_hi: row.ticket_name_hi },
        schedule: {
          event_date: isoDate(row.event_date),
          end_date: row.end_date ? isoDate(row.end_date) : null,
          start_time: row.start_time,
          end_time: row.end_time,
        },
        location: {
          state_en: row.state_en,
          state_hi: row.state_hi,
          city_en: row.city_en,
          city_hi: row.city_hi,
          venue_en: row.venue_en,
          venue_hi: row.venue_hi,
          address_en: row.address_en,
          address_hi: row.address_hi,
        },
        attendees: attendeesOf(row.attendees_json),
        entries: {
          used: Number(row.entries_used),
          daysUsed: Number(row.days_used),
          today: Number(row.entries_today),
          lastEntryDate: row.last_day ? isoDate(row.last_day) : null,
          lastEntryAt: row.last_at,
          lastGate: row.last_gate || null,
          lastStaff: row.last_staff || null,
        },
      })),
      blocks: blocks.map((block) => ({
        bookingId: block.booking_id ? Number(block.booking_id) : null,
        email: block.email || null,
        phone: block.phone || null,
        scope: block.scope,
        eventId: block.event_id ? Number(block.event_id) : null,
        reason: block.reason,
        blockedBy: block.blocked_by_name || null,
      })),
    });
  }),
);

/**
 * Replays scans that were admitted while the venue had no internet. Each scan carries a
 * device-generated id, so a retried request can never admit the same person twice.
 */
staffRouter.post(
  '/sync-offline',
  offlineSyncLimiter,
  asyncHandler(async (req, res) => {
    const parsed = offlineSyncSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'The offline scan queue is not valid.');

    const actor = req.admin;
    const ip = clientIp(req);
    const results = [];

    for (const scan of parsed.data.scans) {
      try {
        const [existing] = await query(
          `SELECT c.id, b.reference FROM event_booking_checkins c
           JOIN event_bookings b ON b.id = c.booking_id
           WHERE c.client_scan_id = ? LIMIT 1`,
          [scan.clientId],
        );
        if (existing) {
          results.push({
            clientId: scan.clientId,
            status: 'synced',
            duplicate: true,
            reference: existing.reference,
          });
          continue;
        }

        const result = await checkInBooking({
          code: scan.code,
          actor,
          ip,
          gate: scan.gate,
          entryDate: scan.entryDate,
          clientScanId: scan.clientId,
        });
        results.push({
          clientId: scan.clientId,
          status: 'synced',
          reference: result.reference,
          name: result.name,
          entryDate: result.checkIn.entryDate,
        });
      } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') {
          const [existing] = await query(
            `SELECT c.id, b.reference FROM event_booking_checkins c
             JOIN event_bookings b ON b.id = c.booking_id
             WHERE c.client_scan_id = ? LIMIT 1`,
            [scan.clientId],
          );
          results.push({
            clientId: scan.clientId,
            status: 'synced',
            duplicate: true,
            reference: existing?.reference ?? null,
          });
          continue;
        }
        if (err instanceof HttpError) {
          results.push({
            clientId: scan.clientId,
            status: 'rejected',
            message: err.message,
            details: err.details ?? null,
          });
          continue;
        }
        console.error(`[staff] offline sync failed for ${scan.clientId}:`, err?.message);
        results.push({
          clientId: scan.clientId,
          status: 'retry',
          message: 'Could not verify this scan yet. It stays in the queue.',
        });
      }
    }

    const synced = results.filter((item) => item.status === 'synced').length;
    const rejected = results.filter((item) => item.status === 'rejected').length;
    const retry = results.filter((item) => item.status === 'retry').length;

    if (synced > 0 || rejected > 0) {
      await audit({
        actorType: 'admin',
        actorId: actor.id,
        action: 'event.check_in.offline_sync',
        entity: 'event_booking_checkin',
        entityId: null,
        meta: { scans: parsed.data.scans.length, synced, rejected, retry, gate: parsed.data.scans[0]?.gate ?? null },
        ip,
      });
    }

    res.json({ synced, rejected, retry, results });
  }),
);

staffRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [[mine], [today], [total], recent] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM event_booking_checkins WHERE checked_in_by = ?', [req.admin.id]),
      query('SELECT COUNT(*) AS n FROM event_booking_checkins WHERE entry_date = CURDATE()'),
      query('SELECT COUNT(*) AS n FROM event_booking_checkins'),
      query(
        `SELECT ci.id, b.reference, b.name, b.qty, ci.created_at AS check_in_at, ci.entry_date, ci.gate,
                DATEDIFF(ci.entry_date, s.event_date) + 1 AS day_number,
                GREATEST(1, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1) AS calendar_days,
                GREATEST(1, LEAST(b.pass_days, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1)) AS pass_days,
                b.qty AS entries_allowed,
                (SELECT COUNT(*) FROM event_booking_checkins x
                  WHERE x.booking_id = ci.booking_id AND x.entry_date = ci.entry_date AND x.id <= ci.id) AS entry_number,
                e.name_en AS event_en, tt.name_en AS ticket_en,
                c.name_en AS city_en, v.name_en AS venue_en
         FROM event_booking_checkins ci
         JOIN event_bookings b ON b.id = ci.booking_id
         JOIN events e ON e.id = b.event_id
         JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
         JOIN event_schedules s ON s.id = b.schedule_id
         JOIN event_cities c ON c.id = s.city_id
         JOIN event_venues v ON v.id = s.venue_id
         ORDER BY ci.created_at DESC, ci.id DESC LIMIT 8`,
      ),
    ]);

    res.json({
      myCheckIns: Number(mine.n),
      todayCheckIns: Number(today.n),
      totalCheckIns: Number(total.n),
      recent,
    });
  }),
);

staffRouter.post(
  '/scan',
  scanLimiter,
  asyncHandler(async (req, res) => {
    const parsed = scanSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Scan a QR pass or enter a reference number.');

    const result = await checkInBooking({
      code: parsed.data.code,
      actor: req.admin,
      ip: clientIp(req),
      gate: parsed.data.gate,
      positions: parsed.data.positions,
    });
    res.json(result);
  }),
);
