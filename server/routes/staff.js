import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, asyncHandler } from '../lib/util.js';
import { clientIp, requireAdmin, requireRole } from '../lib/auth.js';
import { checkInBooking } from '../lib/checkin.js';

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

const scanSchema = z.object({
  code: z.string().trim().min(3).max(40),
});

staffRouter.use(requireAdmin);
staffRouter.use(requireRole('owner', 'manager', 'staff'));

staffRouter.get('/me', (req, res) => {
  res.json({ staff: req.admin });
});

staffRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [[mine], [today], [total], recent] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM event_booking_checkins WHERE checked_in_by = ?', [req.admin.id]),
      query('SELECT COUNT(*) AS n FROM event_booking_checkins WHERE entry_date = CURDATE()'),
      query('SELECT COUNT(*) AS n FROM event_booking_checkins'),
      query(
        `SELECT ci.id, b.reference, b.name, b.qty, ci.created_at AS check_in_at, ci.entry_date,
                DATEDIFF(ci.entry_date, s.event_date) + 1 AS day_number,
                GREATEST(1, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1) AS calendar_days,
                GREATEST(1, LEAST(b.pass_days, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1)) AS entries_allowed,
                (SELECT COUNT(*) FROM event_booking_checkins x
                  WHERE x.booking_id = ci.booking_id AND x.entry_date <= ci.entry_date) AS entry_number,
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
    });
    res.json(result);
  }),
);
