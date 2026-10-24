import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, asyncHandler, makeReference } from '../lib/util.js';
import {
  audit,
  clearAdminCookie,
  clientIp,
  requireAdmin,
  requireRole,
  setAdminCookie,
  signAdminToken,
} from '../lib/auth.js';
import {
  bookingSummary,
  exportBookingsPdf,
  exportBookingsXlsx,
  fetchAdminBookings,
  parseBookingFilters,
} from '../lib/eventReports.js';
import { checkInBooking } from '../lib/checkin.js';
import {
  getSalesSettings,
  isSalesClosed,
  saveSalesSettings,
  smtpConfigured,
} from '../lib/settings.js';
import { invalidateEventPageCache } from '../lib/pageCache.js';
import { effectiveUnitPrice, priceSlabsByTicket } from '../lib/ticketPricing.js';
import { runReminderSweep } from '../lib/reminders.js';
import { activateBooking, loadBookingById, publicPass } from '../lib/eventBookings.js';
import { normalizeCode } from '../lib/offers.js';
import { replaceAttendees } from '../lib/attendees.js';
import { createBlock, listBlocks, setBlockActive } from '../lib/entryBlocks.js';

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

adminRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter a valid email and password.');

    const email = parsed.data.email.toLowerCase();
    const [admin] = await query('SELECT * FROM admins WHERE email = ? LIMIT 1', [email]);

    // Constant-ish response so a missing account is not distinguishable.
    if (!admin) {
      await bcrypt.compare(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
      throw new HttpError(401, 'Invalid email or password.');
    }

    if (!Number(admin.active)) throw new HttpError(403, 'This account is disabled. Contact the owner.');

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      throw new HttpError(423, 'This account is temporarily locked. Try again in a few minutes.');
    }

    const ok = await bcrypt.compare(parsed.data.password, admin.password_hash);
    if (!ok) {
      const attempts = Number(admin.failed_attempts) + 1;
      const lock = attempts >= 5 ? 'DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : 'NULL';
      await query(`UPDATE admins SET failed_attempts = ?, locked_until = ${lock} WHERE id = ?`, [attempts, admin.id]);
      await audit({
        actorType: 'admin',
        actorId: admin.id,
        action: 'admin.login.failed',
        ip: clientIp(req),
      });
      throw new HttpError(401, 'Invalid email or password.');
    }

    await query(
      'UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
      [admin.id],
    );
    await audit({ actorType: 'admin', actorId: admin.id, action: 'admin.login', ip: clientIp(req) });

    const token = signAdminToken(admin);
    setAdminCookie(res, token);
    res.json({
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      token,
    });
  }),
);

adminRouter.post('/logout', (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

adminRouter.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ admin: req.admin });
  }),
);

adminRouter.use(requireAdmin);
adminRouter.use(requireRole('owner', 'manager'));

// Any successful admin mutation can change what visitors see.
adminRouter.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) invalidateEventPageCache();
    });
  }
  next();
});

const salesSettingsSchema = z.object({
  paused: z.boolean(),
  message_en: z.string().trim().min(1).max(400),
  message_hi: z.string().trim().min(1).max(500),
  resume_at: z
    .union([
      z.string().trim().regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, 'Use a valid date and time.'),
      z.null(),
    ])
    .optional(),
  reminders_enabled: z.boolean(),
});

adminRouter.get(
  '/settings/sales',
  asyncHandler(async (_req, res) => {
    const settings = await getSalesSettings({ fresh: true });
    res.json({
      settings: { ...settings, closed: isSalesClosed(settings) },
      smtpConfigured: smtpConfigured(),
    });
  }),
);

adminRouter.put(
  '/settings/sales',
  asyncHandler(async (req, res) => {
    const parsed = salesSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the sales settings.', parsed.error.flatten().fieldErrors);
    }
    const input = {
      ...parsed.data,
      resume_at: parsed.data.resume_at ? parsed.data.resume_at.replace('T', ' ').slice(0, 19) : null,
    };
    const settings = await saveSalesSettings(input, req.admin.id);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: input.paused ? 'event.sales.paused' : 'event.sales.opened',
      entity: 'app_settings',
      entityId: 'sales',
      meta: {
        paused: input.paused,
        resume_at: input.resume_at,
        reminders_enabled: input.reminders_enabled,
      },
      ip: clientIp(req),
    });
    res.json({ settings: { ...settings, closed: isSalesClosed(settings) }, smtpConfigured: smtpConfigured() });
  }),
);

adminRouter.get(
  '/reminders',
  asyncHandler(async (_req, res) => {
    const [counts, reminders] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status = 'sent'), 0) AS sent,
                COALESCE(SUM(status = 'pending'), 0) AS pending,
                COALESCE(SUM(status = 'failed'), 0) AS failed,
                COALESCE(SUM(status = 'skipped'), 0) AS skipped
         FROM email_reminders`,
      ),
      query(
        `SELECT r.id, r.booking_id, r.reminder_type, r.status, r.attempts, r.sent_at, r.last_error,
                r.created_at, b.reference, b.name, b.email, b.status AS booking_status
         FROM email_reminders r JOIN event_bookings b ON b.id = r.booking_id
         ORDER BY r.id DESC LIMIT 100`,
      ),
    ]);
    const row = counts[0] ?? {};
    res.json({
      counts: {
        total: Number(row.total || 0),
        sent: Number(row.sent || 0),
        pending: Number(row.pending || 0),
        failed: Number(row.failed || 0),
        skipped: Number(row.skipped || 0),
      },
      reminders,
    });
  }),
);

adminRouter.post(
  '/reminders/run',
  asyncHandler(async (req, res) => {
    const result = await runReminderSweep();
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.reminders.run',
      entity: 'email_reminders',
      meta: result,
      ip: clientIp(req),
    });
    res.json(result);
  }),
);

adminRouter.post(
  '/reminders/:id/retry',
  asyncHandler(async (req, res) => {
    const result = await query(
      `UPDATE email_reminders SET status = 'pending', attempts = 0, last_error = NULL
       WHERE id = ? AND status IN ('failed', 'skipped')`,
      [req.params.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Reminder not found or already sent.');
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.reminder.retry',
      entity: 'email_reminders',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/emails',
  asyncHandler(async (_req, res) => {
    const [counts, otpCounts, emails, otps] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(status = 'sent'), 0) AS sent,
                COALESCE(SUM(status = 'logged'), 0) AS logged,
                COALESCE(SUM(status = 'failed'), 0) AS failed
         FROM email_log`,
      ),
      query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(consumed_at IS NOT NULL), 0) AS verified,
                COALESCE(SUM(consumed_at IS NULL AND expires_at >= NOW()), 0) AS active,
                COALESCE(SUM(consumed_at IS NULL AND expires_at < NOW()), 0) AS expired
         FROM event_booking_otps`,
      ),
      query(
        `SELECT id, kind, recipient, subject, booking_id, reference, reminder_type,
                status, provider, error, created_at
         FROM email_log ORDER BY id DESC LIMIT 150`,
      ),
      query(
        `SELECT o.id, o.booking_id, b.reference, b.name, b.email, o.attempts,
                o.expires_at, o.consumed_at, o.created_at,
                CASE WHEN o.consumed_at IS NOT NULL THEN 'verified'
                     WHEN o.expires_at < NOW() THEN 'expired'
                     ELSE 'active' END AS otp_status
         FROM event_booking_otps o
         LEFT JOIN event_bookings b ON b.id = o.booking_id
         ORDER BY o.id DESC LIMIT 100`,
      ),
    ]);
    const row = counts[0] ?? {};
    const otpRow = otpCounts[0] ?? {};
    res.json({
      smtpConfigured: smtpConfigured(),
      counts: {
        total: Number(row.total || 0),
        sent: Number(row.sent || 0),
        logged: Number(row.logged || 0),
        failed: Number(row.failed || 0),
      },
      otpCounts: {
        total: Number(otpRow.total || 0),
        verified: Number(otpRow.verified || 0),
        active: Number(otpRow.active || 0),
        expired: Number(otpRow.expired || 0),
      },
      emails,
      otps,
    });
  }),
);

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [[totals], byState, byTicket, byEvent, recent] = await Promise.all([
      query(
        `SELECT COUNT(*) AS bookings,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN qty ELSE 0 END), 0) AS seats,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(status = 'pending'), 0) AS pending,
                COALESCE(SUM(check_in_at IS NOT NULL), 0) AS checkins
         FROM event_bookings`,
      ),
      query(
        `SELECT st.id, st.name_en, st.name_hi,
                COUNT(DISTINCT b.id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.qty ELSE 0 END), 0) AS seats,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) AS revenue
         FROM event_states st
         LEFT JOIN event_cities c ON c.state_id = st.id
         LEFT JOIN event_schedules s ON s.city_id = c.id
         LEFT JOIN event_bookings b ON b.schedule_id = s.id
         GROUP BY st.id, st.name_en, st.name_hi
         HAVING bookings > 0
         ORDER BY revenue DESC, seats DESC`,
      ),
      query(
        `SELECT tt.id, tt.name_en, tt.name_hi, tt.price, tt.default_capacity,
                e.name_en AS event_en, e.name_hi AS event_hi, e.kind,
                COALESCE(SUM(cap.capacity), 0) AS capacity,
                COALESCE((
                  SELECT SUM(b.qty) FROM event_bookings b
                  WHERE b.ticket_type_id = tt.id AND b.status = 'paid'
                ), 0) AS sold
         FROM event_ticket_types tt
         JOIN events e ON e.id = tt.event_id
         LEFT JOIN event_schedule_capacities cap ON cap.ticket_type_id = tt.id
         LEFT JOIN event_schedules s ON s.id = cap.schedule_id AND s.active = 1
         WHERE tt.active = 1
         GROUP BY tt.id
         ORDER BY e.sort_order, tt.sort_order`,
      ),
      query(
        `SELECT e.id, e.name_en, e.name_hi, e.kind,
                COUNT(b.id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.qty ELSE 0 END), 0) AS seats,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) AS revenue
         FROM events e LEFT JOIN event_bookings b ON b.event_id = e.id
         WHERE e.active = 1 GROUP BY e.id ORDER BY e.sort_order`,
      ),
      query(
        `SELECT b.reference, b.name, b.qty, b.amount, b.status, b.created_at,
                e.name_en AS event_en, tt.name_en AS ticket_en
         FROM event_bookings b
         JOIN events e ON e.id = b.event_id
         JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
         ORDER BY b.id DESC LIMIT 8`,
      ),
    ]);

    res.json({
      totals: {
        bookings: Number(totals.bookings),
        seats: Number(totals.seats),
        revenue: Number(totals.revenue),
        pending: Number(totals.pending),
        checkins: Number(totals.checkins),
      },
      byState: byState.map((row) => ({
        ...row,
        bookings: Number(row.bookings),
        seats: Number(row.seats),
        revenue: Number(row.revenue),
      })),
      byTicket: byTicket.map((row) => ({
        ...row,
        capacity: Number(row.capacity),
        sold: Number(row.sold),
        left: Math.max(0, Number(row.capacity) - Number(row.sold)),
      })),
      byEvent,
      recent,
    });
  }),
);

/* ------------------------------- Content ------------------------------- */

adminRouter.get(
  '/content',
  asyncHandler(async (_req, res) => {
    const rows = await query('SELECT content_key, value_json, updated_at FROM event_content ORDER BY content_key');
    res.json({ sections: rows });
  }),
);

adminRouter.put(
  '/content/:key',
  asyncHandler(async (req, res) => {
    const key = String(req.params.key);
    if (!/^[a-z0-9_]{2,64}$/.test(key)) throw new HttpError(400, 'Invalid content key.');
    const value = req.body?.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpError(400, 'Content must be an object.');
    }
    if (JSON.stringify(value).length > 200_000) throw new HttpError(413, 'Content is too large.');

    const result = await query('UPDATE event_content SET value_json = ? WHERE content_key = ?', [
      JSON.stringify(value),
      key,
    ]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Content section not found.');

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.content.updated',
      entity: 'event_content',
      entityId: key,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

/* -------------------------------- Events ------------------------------- */

adminRouter.get(
  '/events',
  asyncHandler(async (_req, res) => {
    const [events, tickets, slabsByTicket] = await Promise.all([
      query('SELECT * FROM events ORDER BY sort_order, id'),
      query('SELECT * FROM event_ticket_types ORDER BY event_id, sort_order, id'),
      priceSlabsByTicket(),
    ]);
    res.json({
      events: events.map((event) => ({
        ...event,
        tickets: tickets
          .filter((ticket) => ticket.event_id === event.id)
          .map((ticket) => ({ ...ticket, price_slabs: slabsByTicket.get(ticket.id) || [] })),
      })),
    });
  }),
);

const dateOrNull = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional()
  .or(z.literal(''));

const eventSchema = z.object({
  name_en: z.string().trim().min(2).max(160),
  name_hi: z.string().trim().min(1).max(200),
  tagline_en: z.string().trim().max(255).default(''),
  tagline_hi: z.string().trim().max(300).default(''),
  description_en: z.string().trim().max(5000).nullable().optional(),
  description_hi: z.string().trim().max(5000).nullable().optional(),
  date_label_en: z.string().trim().max(120).default(''),
  date_label_hi: z.string().trim().max(140).default(''),
  starts_on: dateOrNull,
  ends_on: dateOrNull,
  sale_ends_at: z.string().trim().max(30).nullable().optional().or(z.literal('')),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

function toDateTime(value) {
  if (!value) return null;
  const text = String(value).trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(text)) {
    throw new HttpError(400, 'Sale end must be a valid date and time.');
  }
  return text.length === 16 ? `${text}:00` : text;
}

adminRouter.put(
  '/events/:id',
  asyncHandler(async (req, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the event fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const result = await query(
      `UPDATE events SET
        name_en = ?, name_hi = ?, tagline_en = ?, tagline_hi = ?, description_en = ?, description_hi = ?,
        date_label_en = ?, date_label_hi = ?, starts_on = ?, ends_on = ?, sale_ends_at = ?, active = ?
       WHERE id = ?`,
      [
        d.name_en, d.name_hi, d.tagline_en, d.tagline_hi, d.description_en || null, d.description_hi || null,
        d.date_label_en, d.date_label_hi, d.starts_on || null, d.ends_on || null,
        toDateTime(d.sale_ends_at), d.active, req.params.id,
      ],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Event not found.');

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.updated',
      entity: 'event',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

const ticketSchema = z.object({
  event_id: z.coerce.number().int().positive(),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,64}$/),
  name_en: z.string().trim().min(2).max(120),
  name_hi: z.string().trim().min(1).max(160),
  description_en: z.string().trim().max(400).default(''),
  description_hi: z.string().trim().max(500).default(''),
  price: z.coerce.number().int().min(0).max(100_000_000),
  original_price: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  default_capacity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  valid_days: z.coerce.number().int().min(1).max(60).default(1),
  inclusions: z.array(z.object({ en: z.string(), hi: z.string() })).default([]),
  badge_en: z.string().trim().max(60).nullable().optional(),
  badge_hi: z.string().trim().max(80).nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

function ticketParams(d) {
  return [
    d.event_id, d.slug, d.name_en, d.name_hi, d.description_en, d.description_hi, d.price,
    d.original_price ?? null, d.default_capacity, d.valid_days, JSON.stringify(d.inclusions ?? []),
    d.badge_en ?? null, d.badge_hi ?? null, d.sort_order, d.active,
  ];
}

adminRouter.post(
  '/tickets',
  asyncHandler(async (req, res) => {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the ticket fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const [event] = await query('SELECT id FROM events WHERE id = ?', [d.event_id]);
    if (!event) throw new HttpError(400, 'Choose a valid event.');

    const result = await query(
      `INSERT INTO event_ticket_types
        (event_id, slug, name_en, name_hi, description_en, description_hi, price, original_price,
         default_capacity, valid_days, inclusions, badge_en, badge_hi, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ticketParams(d),
    );

    const schedules = await query('SELECT id FROM event_schedules WHERE event_id = ?', [d.event_id]);
    for (const schedule of schedules) {
      await query(
        `INSERT INTO event_schedule_capacities (schedule_id, ticket_type_id, capacity)
         VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE capacity = capacity`,
        [schedule.id, result.insertId, d.default_capacity],
      );
    }

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.ticket.created',
      entity: 'event_ticket_type',
      entityId: String(result.insertId),
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.status(201).json({ id: result.insertId });
  }),
);

adminRouter.put(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const parsed = ticketSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the ticket fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const result = await query(
      `UPDATE event_ticket_types SET
        event_id = ?, slug = ?, name_en = ?, name_hi = ?, description_en = ?, description_hi = ?,
        price = ?, original_price = ?, default_capacity = ?, valid_days = ?, inclusions = ?, badge_en = ?, badge_hi = ?,
        sort_order = ?, active = ?
       WHERE id = ?`,
      [...ticketParams(d), req.params.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Ticket not found.');

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.ticket.updated',
      entity: 'event_ticket_type',
      entityId: String(req.params.id),
      meta: { price: d.price, active: d.active },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/tickets/:id',
  asyncHandler(async (req, res) => {
    const [used] = await query('SELECT COUNT(*) AS n FROM event_bookings WHERE ticket_type_id = ?', [req.params.id]);
    if (Number(used.n) > 0) {
      throw new HttpError(409, 'This ticket has bookings. Deactivate it instead of deleting.');
    }
    await query('DELETE FROM event_ticket_types WHERE id = ?', [req.params.id]);
    invalidateEventPageCache();
    res.json({ ok: true });
  }),
);

/* --------------------------- Ticket price slabs -------------------------- */

const slabSchema = z.object({
  effective_from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date this price starts.'),
  price: z.coerce.number().int().min(0).max(100_000_000),
  label_en: z.string().trim().max(80).nullable().optional(),
  label_hi: z.string().trim().max(100).nullable().optional(),
});

adminRouter.post(
  '/tickets/:id/slabs',
  asyncHandler(async (req, res) => {
    const parsed = slabSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the price slab.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const [ticket] = await query('SELECT id, name_en FROM event_ticket_types WHERE id = ? LIMIT 1', [req.params.id]);
    if (!ticket) throw new HttpError(404, 'Ticket not found.');

    const existing = await query(
      'SELECT id FROM event_ticket_price_slabs WHERE ticket_type_id = ? AND effective_from = ? LIMIT 1',
      [ticket.id, d.effective_from],
    );
    if (existing.length > 0) {
      await query('UPDATE event_ticket_price_slabs SET price = ?, label_en = ?, label_hi = ? WHERE id = ?', [
        d.price, d.label_en || null, d.label_hi || null, existing[0].id,
      ]);
      invalidateEventPageCache();
      return res.json({ ok: true, id: existing[0].id, updated: true });
    }

    const result = await query(
      `INSERT INTO event_ticket_price_slabs (ticket_type_id, effective_from, price, label_en, label_hi)
       VALUES (?, ?, ?, ?, ?)`,
      [ticket.id, d.effective_from, d.price, d.label_en || null, d.label_hi || null],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.ticket.slab.created',
      entity: 'event_ticket_type',
      entityId: String(ticket.id),
      meta: { effective_from: d.effective_from, price: d.price },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.status(201).json({ ok: true, id: result.insertId });
  }),
);

adminRouter.delete(
  '/tickets/:id/slabs/:slabId',
  asyncHandler(async (req, res) => {
    const result = await query(
      'DELETE FROM event_ticket_price_slabs WHERE id = ? AND ticket_type_id = ?',
      [req.params.slabId, req.params.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Price slab not found.');
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.ticket.slab.deleted',
      entity: 'event_ticket_type',
      entityId: String(req.params.id),
      meta: { slabId: req.params.slabId },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.json({ ok: true });
  }),
);

/* ------------------------------ Locations ------------------------------ */

adminRouter.get(
  '/locations',
  asyncHandler(async (_req, res) => {
    const [states, cities, venues] = await Promise.all([
      query('SELECT * FROM event_states ORDER BY sort_order, id'),
      query('SELECT * FROM event_cities ORDER BY sort_order, id'),
      query('SELECT * FROM event_venues ORDER BY sort_order, id'),
    ]);
    res.json({
      states: states.map((state) => ({
        ...state,
        cities: cities
          .filter((city) => city.state_id === state.id)
          .map((city) => ({
            ...city,
            venues: venues.filter((venue) => venue.city_id === city.id),
          })),
      })),
    });
  }),
);

const stateSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9]{2,8}$/).transform((value) => value.toUpperCase()),
  name_en: z.string().trim().min(2).max(120),
  name_hi: z.string().trim().min(1).max(160),
  sort_order: z.coerce.number().int().default(0),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

const citySchema = z.object({
  state_id: z.coerce.number().int().positive(),
  name_en: z.string().trim().min(2).max(120),
  name_hi: z.string().trim().min(1).max(160),
  sort_order: z.coerce.number().int().default(0),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

const venueSchema = z.object({
  city_id: z.coerce.number().int().positive(),
  name_en: z.string().trim().min(2).max(160),
  name_hi: z.string().trim().min(1).max(200),
  address_en: z.string().trim().min(4).max(255),
  address_hi: z.string().trim().min(2).max(300),
  map_url: z.string().trim().max(255).nullable().optional().or(z.literal('')),
  sort_order: z.coerce.number().int().default(0),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

function locationRoutes(path, table, schema, entity, columns, guard) {
  adminRouter.post(
    `/${path}`,
    asyncHandler(async (req, res) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Check the fields.', parsed.error.flatten().fieldErrors);
      if (guard) await guard(parsed.data);
      const values = columns.map((column) => parsed.data[column] ?? null);
      const result = await query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        values,
      );
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: `${entity}.created`,
        entity,
        entityId: String(result.insertId),
        ip: clientIp(req),
      });
      res.status(201).json({ id: result.insertId });
    }),
  );

  adminRouter.put(
    `/${path}/:id`,
    asyncHandler(async (req, res) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) throw new HttpError(400, 'Check the fields.', parsed.error.flatten().fieldErrors);
      if (guard) await guard(parsed.data);
      const values = columns.map((column) => parsed.data[column] ?? null);
      const result = await query(
        `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...values, req.params.id],
      );
      if (result.affectedRows === 0) throw new HttpError(404, 'Record not found.');
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: `${entity}.updated`,
        entity,
        entityId: String(req.params.id),
        ip: clientIp(req),
      });
      res.json({ ok: true });
    }),
  );

}

locationRoutes('states', 'event_states', stateSchema, 'event_state', ['code', 'name_en', 'name_hi', 'sort_order', 'active']);
locationRoutes(
  'cities',
  'event_cities',
  citySchema,
  'event_city',
  ['state_id', 'name_en', 'name_hi', 'sort_order', 'active'],
  async (data) => {
    const [state] = await query('SELECT id FROM event_states WHERE id = ?', [data.state_id]);
    if (!state) throw new HttpError(400, 'Choose a valid state.');
  },
);
locationRoutes(
  'venues',
  'event_venues',
  venueSchema,
  'event_venue',
  ['city_id', 'name_en', 'name_hi', 'address_en', 'address_hi', 'map_url', 'sort_order', 'active'],
  async (data) => {
    const [city] = await query('SELECT id FROM event_cities WHERE id = ?', [data.city_id]);
    if (!city) throw new HttpError(400, 'Choose a valid city.');
  },
);

async function guardLocationDelete(req, type) {
  const { id } = req.params;
  if (type === 'state') {
    const [cities] = await query('SELECT COUNT(*) AS n FROM event_cities WHERE state_id = ?', [id]);
    const [schedules] = await query('SELECT COUNT(*) AS n FROM event_schedules WHERE state_id = ?', [id]);
    if (Number(cities.n) || Number(schedules.n)) {
      throw new HttpError(409, 'This state has cities or schedules. Remove them first or deactivate it.');
    }
  }
  if (type === 'city') {
    const [venues] = await query('SELECT COUNT(*) AS n FROM event_venues WHERE city_id = ?', [id]);
    const [schedules] = await query('SELECT COUNT(*) AS n FROM event_schedules WHERE city_id = ?', [id]);
    if (Number(venues.n) || Number(schedules.n)) {
      throw new HttpError(409, 'This city has venues or schedules. Remove them first or deactivate it.');
    }
  }
  if (type === 'venue') {
    const [schedules] = await query('SELECT COUNT(*) AS n FROM event_schedules WHERE venue_id = ?', [id]);
    if (Number(schedules.n)) {
      throw new HttpError(409, 'This venue has schedules. Remove them first or deactivate it.');
    }
  }
}

adminRouter.delete(
  '/states/:id',
  asyncHandler(async (req, res) => {
    await guardLocationDelete(req, 'state');
    await query('DELETE FROM event_states WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }),
);
adminRouter.delete(
  '/cities/:id',
  asyncHandler(async (req, res) => {
    await guardLocationDelete(req, 'city');
    await query('DELETE FROM event_cities WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }),
);
adminRouter.delete(
  '/venues/:id',
  asyncHandler(async (req, res) => {
    await guardLocationDelete(req, 'venue');
    await query('DELETE FROM event_venues WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }),
);

/* ------------------------------ Schedules ------------------------------ */

adminRouter.get(
  '/schedules',
  asyncHandler(async (_req, res) => {
    const [rows, capacities, tickets, sold] = await Promise.all([
      query(
        `SELECT s.*, e.name_en AS event_en, e.name_hi AS event_hi, e.kind, e.slug AS event_slug,
                st.name_en AS state_en, st.name_hi AS state_hi,
                c.name_en AS city_en, c.name_hi AS city_hi,
                v.name_en AS venue_en, v.name_hi AS venue_hi, v.address_en, v.address_hi
         FROM event_schedules s
         JOIN events e ON e.id = s.event_id
         JOIN event_states st ON st.id = s.state_id
         JOIN event_cities c ON c.id = s.city_id
         JOIN event_venues v ON v.id = s.venue_id
         ORDER BY e.sort_order, s.event_date, st.sort_order, v.sort_order`,
      ),
      query(
        `SELECT cap.schedule_id, cap.ticket_type_id, cap.capacity, tt.name_en AS ticket_en, tt.name_hi AS ticket_hi
         FROM event_schedule_capacities cap
         JOIN event_ticket_types tt ON tt.id = cap.ticket_type_id`,
      ),
      query('SELECT id, event_id, name_en, name_hi, default_capacity, active FROM event_ticket_types ORDER BY sort_order, id'),
      query(
        `SELECT schedule_id, ticket_type_id, COALESCE(SUM(qty), 0) AS sold
         FROM event_bookings
         WHERE status = 'paid' OR (status = 'pending' AND created_at > NOW() - INTERVAL 30 MINUTE)
         GROUP BY schedule_id, ticket_type_id`,
      ),
    ]);

    const soldMap = new Map(sold.map((row) => [`${row.schedule_id}:${row.ticket_type_id}`, Number(row.sold)]));
    res.json({
      schedules: rows.map((schedule) => ({
        ...schedule,
        capacities: capacities
          .filter((capacity) => capacity.schedule_id === schedule.id)
          .map((capacity) => ({
            ...capacity,
            capacity: Number(capacity.capacity),
            sold: soldMap.get(`${capacity.schedule_id}:${capacity.ticket_type_id}`) || 0,
          })),
        tickets: tickets.filter((ticket) => ticket.event_id === schedule.event_id),
      })),
      tickets,
    });
  }),
);

const scheduleSchema = z.object({
  event_id: z.coerce.number().int().positive(),
  state_id: z.coerce.number().int().positive(),
  city_id: z.coerce.number().int().positive(),
  venue_id: z.coerce.number().int().positive(),
  event_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: dateOrNull,
  start_time: z.string().trim().max(8).nullable().optional().or(z.literal('')),
  end_time: z.string().trim().max(8).nullable().optional().or(z.literal('')),
  sale_ends_at: z.string().trim().max(30).nullable().optional().or(z.literal('')),
  note_en: z.string().trim().max(255).nullable().optional().or(z.literal('')),
  note_hi: z.string().trim().max(300).nullable().optional().or(z.literal('')),
  active: z.coerce.number().int().min(0).max(1).default(1),
  capacities: z
    .array(z.object({ ticket_type_id: z.coerce.number().int().positive(), capacity: z.coerce.number().int().min(0) }))
    .optional(),
});

function toTime(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(text)) throw new HttpError(400, 'Times must use HH:MM.');
  return text.length === 5 ? `${text}:00` : text;
}

async function validateScheduleLinks(data) {
  const [event] = await query('SELECT id FROM events WHERE id = ?', [data.event_id]);
  if (!event) throw new HttpError(400, 'Choose a valid event.');
  const [city] = await query('SELECT id, state_id FROM event_cities WHERE id = ?', [data.city_id]);
  if (!city) throw new HttpError(400, 'Choose a valid city.');
  if (Number(city.state_id) !== Number(data.state_id)) throw new HttpError(400, 'The city does not belong to that state.');
  const [venue] = await query('SELECT id, city_id FROM event_venues WHERE id = ?', [data.venue_id]);
  if (!venue) throw new HttpError(400, 'Choose a valid venue.');
  if (Number(venue.city_id) !== Number(data.city_id)) throw new HttpError(400, 'The venue does not belong to that city.');
  if (data.end_date && data.end_date < data.event_date) throw new HttpError(400, 'End date cannot be before the start date.');
}

async function saveCapacities(scheduleId, eventId, provided) {
  const tickets = await query(
    'SELECT id, name_en, default_capacity FROM event_ticket_types WHERE event_id = ? ORDER BY sort_order, id',
    [eventId],
  );
  const map = new Map((provided || []).map((row) => [Number(row.ticket_type_id), Number(row.capacity)]));
  for (const ticket of tickets) {
    const capacity = map.has(ticket.id) ? map.get(ticket.id) : Number(ticket.default_capacity);
    const [sold] = await query(
      `SELECT COALESCE(SUM(qty), 0) AS sold FROM event_bookings
       WHERE schedule_id = ? AND ticket_type_id = ? AND status = 'paid'`,
      [scheduleId, ticket.id],
    );
    if (capacity < Number(sold.sold)) {
      throw new HttpError(409, `Capacity for "${ticket.name_en}" is below the ${sold.sold} seats already sold.`);
    }
    await query(
      `INSERT INTO event_schedule_capacities (schedule_id, ticket_type_id, capacity)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE capacity = VALUES(capacity)`,
      [scheduleId, ticket.id, capacity],
    );
  }
}

adminRouter.post(
  '/schedules',
  asyncHandler(async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the schedule fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    await validateScheduleLinks(d);

    const result = await query(
      `INSERT INTO event_schedules
        (event_id, state_id, city_id, venue_id, event_date, end_date, start_time, end_time, sale_ends_at,
         note_en, note_hi, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.event_id, d.state_id, d.city_id, d.venue_id, d.event_date, d.end_date || null,
        toTime(d.start_time), toTime(d.end_time), toDateTime(d.sale_ends_at),
        d.note_en || null, d.note_hi || null, d.active,
      ],
    ).catch((err) => {
      if (err?.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'A schedule already exists for this venue and date.');
      throw err;
    });

    await saveCapacities(result.insertId, d.event_id, d.capacities);

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.schedule.created',
      entity: 'event_schedule',
      entityId: String(result.insertId),
      ip: clientIp(req),
    });
    res.status(201).json({ id: result.insertId });
  }),
);

adminRouter.put(
  '/schedules/:id',
  asyncHandler(async (req, res) => {
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the schedule fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;
    await validateScheduleLinks(d);

    const result = await query(
      `UPDATE event_schedules SET
        event_id = ?, state_id = ?, city_id = ?, venue_id = ?, event_date = ?, end_date = ?,
        start_time = ?, end_time = ?, sale_ends_at = ?, note_en = ?, note_hi = ?, active = ?
       WHERE id = ?`,
      [
        d.event_id, d.state_id, d.city_id, d.venue_id, d.event_date, d.end_date || null,
        toTime(d.start_time), toTime(d.end_time), toDateTime(d.sale_ends_at),
        d.note_en || null, d.note_hi || null, d.active, req.params.id,
      ],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Schedule not found.');

    await saveCapacities(Number(req.params.id), d.event_id, d.capacities);

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.schedule.updated',
      entity: 'event_schedule',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/schedules/:id',
  asyncHandler(async (req, res) => {
    const [used] = await query('SELECT COUNT(*) AS n FROM event_bookings WHERE schedule_id = ?', [req.params.id]);
    if (Number(used.n) > 0) {
      throw new HttpError(409, 'This schedule has bookings. Deactivate it instead of deleting.');
    }
    await query('DELETE FROM event_schedules WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }),
);

/* ------------------------------- Bookings ------------------------------ */

adminRouter.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const filters = parseBookingFilters(req.query);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 300)));
    const [bookings, summary] = await Promise.all([
      fetchAdminBookings(filters, limit),
      bookingSummary(filters),
    ]);
    res.json({ bookings, summary });
  }),
);

adminRouter.get(
  '/exports/bookings.xlsx',
  asyncHandler(async (req, res) => {
    const filters = parseBookingFilters(req.query);
    const buffer = await exportBookingsXlsx(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="adhyatmik-bookings-${stamp}.xlsx"`);
    res.send(Buffer.from(buffer));
  }),
);

adminRouter.get(
  '/exports/bookings.pdf',
  asyncHandler(async (req, res) => {
    const filters = parseBookingFilters(req.query);
    const buffer = await exportBookingsPdf(filters);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="adhyatmik-bookings-${stamp}.pdf"`);
    res.send(buffer);
  }),
);

adminRouter.post(
  '/check-in',
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code || req.body?.token || '').trim();
    const result = await checkInBooking({ code, actor: req.admin, ip: clientIp(req) });
    res.json(result);
  }),
);

adminRouter.get(
  '/payments',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT p.id, p.booking_id, p.provider, p.provider_ref, p.amount, p.status, p.created_at,
              b.reference, b.name
       FROM event_payments p JOIN event_bookings b ON b.id = p.booking_id
       ORDER BY p.id DESC LIMIT 200`,
    );
    res.json({ payments: rows });
  }),
);

/* ------------------------------ State waitlist ------------------------------ */
adminRouter.get(
  '/waitlist',
  asyncHandler(async (req, res) => {
    const stateId = req.query.state_id ? Number(req.query.state_id) : null;
    const status = ['pending', 'verified'].includes(req.query.status) ? req.query.status : null;
    const where = [];
    const params = [];
    if (stateId) {
      where.push('w.state_id = ?');
      params.push(stateId);
    }
    if (status) {
      where.push('w.status = ?');
      params.push(status);
    }
    const [rows, counts] = await Promise.all([
      query(
        `SELECT w.id, w.ref, w.state_id, s.code AS state_code, s.name_en AS state_en, s.name_hi AS state_hi,
                w.name, w.email, w.phone, w.status, w.verified_at, w.created_at
         FROM event_state_waitlist w JOIN event_states s ON s.id = w.state_id
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY w.id DESC LIMIT 500`,
        params,
      ),
      query(
        `SELECT state_id, COUNT(*) AS total, SUM(status = 'verified') AS verified
         FROM event_state_waitlist GROUP BY state_id`,
      ),
    ]);
    res.json({ waitlist: rows, byState: counts });
  }),
);

adminRouter.delete(
  '/waitlist/:id',
  asyncHandler(async (req, res) => {
    const result = await query('DELETE FROM event_state_waitlist WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Waitlist request not found.');
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.waitlist.deleted',
      entity: 'event_state_waitlist',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

/* -------------------------------- Staff -------------------------------- */

adminRouter.get(
  '/staff',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT a.id, a.email, a.name, a.role, a.active, a.last_login_at, a.created_at,
              (SELECT COUNT(*) FROM event_booking_checkins ci WHERE ci.checked_in_by = a.id) AS checkins
       FROM admins a WHERE a.role = 'staff' ORDER BY a.id DESC`,
    );
    res.json({ staff: rows.map((row) => ({ ...row, checkins: Number(row.checkins) })) });
  }),
);

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(200),
});

const passwordSchema = z.object({
  password: z.string().min(8).max(200),
});

adminRouter.post(
  '/staff',
  asyncHandler(async (req, res) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter a name, valid email and a password of at least 8 characters.');
    }
    const email = parsed.data.email.toLowerCase();
    const [existing] = await query('SELECT id FROM admins WHERE email = ? LIMIT 1', [email]);
    if (existing) throw new HttpError(409, 'An account with this email already exists.');

    const hash = await bcrypt.hash(parsed.data.password, 12);
    const result = await query(
      `INSERT INTO admins (email, password_hash, name, role, active) VALUES (?, ?, ?, 'staff', 1)`,
      [email, hash, parsed.data.name],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.created',
      entity: 'admin',
      entityId: String(result.insertId),
      ip: clientIp(req),
    });
    res.status(201).json({ id: result.insertId });
  }),
);

adminRouter.patch(
  '/staff/:id',
  asyncHandler(async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : null;
    const active = req.body?.active;
    const sets = [];
    const params = [];
    if (name) { sets.push('name = ?'); params.push(name); }
    if (active === 0 || active === 1) { sets.push('active = ?'); params.push(active); }
    if (!sets.length) throw new HttpError(400, 'Nothing to update.');

    const result = await query(
      `UPDATE admins SET ${sets.join(', ')} WHERE id = ? AND role = 'staff'`,
      [...params, req.params.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Staff account not found.');

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.updated',
      entity: 'admin',
      entityId: String(req.params.id),
      meta: { active },
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/staff/:id/password',
  asyncHandler(async (req, res) => {
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'The password must be at least 8 characters.');
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const result = await query(
      `UPDATE admins SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ? AND role = 'staff'`,
      [hash, req.params.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Staff account not found.');
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.password_reset',
      entity: 'admin',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/staff/:id',
  asyncHandler(async (req, res) => {
    const result = await query(`UPDATE admins SET active = 0 WHERE id = ? AND role = 'staff'`, [req.params.id]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Staff account not found.');
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.disabled',
      entity: 'admin',
      entityId: String(req.params.id),
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

/* -------------------------------- Coupons -------------------------------- */

const couponSchema = z.object({
  code: z.string().trim().min(3).max(32),
  kind: z.enum(['percent', 'flat']),
  value: z.coerce.number().int().min(1).max(1000000),
  eventId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  ticketTypeId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  minQty: z.coerce.number().int().min(1).max(20).default(1),
  maxUses: z.union([z.coerce.number().int().min(1).max(100000), z.null()]).optional(),
  perEmailLimit: z.coerce.number().int().min(0).max(100).default(1),
  validFrom: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  validUntil: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
  labelEn: z.string().trim().max(120).optional(),
  labelHi: z.string().trim().max(160).optional(),
  active: z.boolean().default(true),
});

/** Normalises the form into coupon columns, refusing combinations that could never pay out. */
async function couponRow(data) {
  const code = normalizeCode(data.code);
  if (code.length < 3) throw new HttpError(400, 'The coupon code needs at least 3 letters or numbers.');
  if (data.kind === 'percent' && data.value > 90) {
    throw new HttpError(400, 'A percentage coupon cannot cover more than 90% of the fare.');
  }
  const validFrom = data.validFrom ?? null;
  const validUntil = data.validUntil ?? null;
  if (validFrom && validUntil && validUntil < validFrom) {
    throw new HttpError(400, 'The coupon expiry date is before its start date.');
  }

  let eventId = data.eventId ?? null;
  const ticketTypeId = data.ticketTypeId ?? null;
  if (ticketTypeId) {
    const [ticket] = await query('SELECT id, event_id FROM event_ticket_types WHERE id = ? LIMIT 1', [ticketTypeId]);
    if (!ticket) throw new HttpError(400, 'Choose a valid pass type for this coupon.');
    if (eventId && Number(ticket.event_id) !== Number(eventId)) {
      throw new HttpError(400, 'That pass type does not belong to the selected event.');
    }
    eventId = ticket.event_id;
  }

  return {
    code,
    kind: data.kind,
    value: data.value,
    eventId,
    ticketTypeId,
    minQty: data.minQty,
    maxUses: data.maxUses ?? null,
    perEmailLimit: data.perEmailLimit,
    validFrom,
    validUntil,
    labelEn: data.labelEn || null,
    labelHi: data.labelHi || null,
    active: data.active ? 1 : 0,
  };
}

adminRouter.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT c.*, e.name_en AS event_en, e.name_hi AS event_hi, tt.name_en AS ticket_en, tt.name_hi AS ticket_hi,
              (SELECT COUNT(*) FROM event_coupon_uses u WHERE u.coupon_id = c.id) AS used
       FROM event_coupons c
       LEFT JOIN events e ON e.id = c.event_id
       LEFT JOIN event_ticket_types tt ON tt.id = c.ticket_type_id
       ORDER BY c.id DESC LIMIT 200`,
    );
    res.json({
      coupons: rows.map((row) => ({
        ...row,
        value: Number(row.value),
        min_qty: Number(row.min_qty),
        per_email_limit: Number(row.per_email_limit),
        used: Number(row.used),
      })),
    });
  }),
);

adminRouter.post(
  '/coupons',
  asyncHandler(async (req, res) => {
    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Please check the coupon details.', parsed.error.flatten().fieldErrors);
    const row = await couponRow(parsed.data);
    const [clash] = await query('SELECT id FROM event_coupons WHERE code = ? LIMIT 1', [row.code]);
    if (clash) throw new HttpError(409, 'A coupon with this code already exists.');

    const result = await query(
      `INSERT INTO event_coupons
        (code, kind, value, event_id, ticket_type_id, min_qty, max_uses, per_email_limit,
         valid_from, valid_until, label_en, label_hi, active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.code, row.kind, row.value, row.eventId, row.ticketTypeId, row.minQty, row.maxUses, row.perEmailLimit,
        row.validFrom, row.validUntil, row.labelEn, row.labelHi, row.active, req.admin.id,
      ],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.coupon.created',
      entity: 'event_coupon',
      entityId: String(result.insertId),
      meta: { code: row.code, kind: row.kind, value: row.value },
      ip: clientIp(req),
    });
    res.status(201).json({ id: result.insertId });
  }),
);

adminRouter.put(
  '/coupons/:id',
  asyncHandler(async (req, res) => {
    const [existing] = await query('SELECT id, code FROM event_coupons WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing) throw new HttpError(404, 'Coupon not found.');

    const parsed = couponSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Please check the coupon details.', parsed.error.flatten().fieldErrors);
    const row = await couponRow(parsed.data);
    const [clash] = await query('SELECT id FROM event_coupons WHERE code = ? AND id <> ? LIMIT 1', [row.code, existing.id]);
    if (clash) throw new HttpError(409, 'Another coupon already uses this code.');

    await query(
      `UPDATE event_coupons SET code = ?, kind = ?, value = ?, event_id = ?, ticket_type_id = ?, min_qty = ?,
              max_uses = ?, per_email_limit = ?, valid_from = ?, valid_until = ?, label_en = ?, label_hi = ?, active = ?
       WHERE id = ?`,
      [
        row.code, row.kind, row.value, row.eventId, row.ticketTypeId, row.minQty, row.maxUses, row.perEmailLimit,
        row.validFrom, row.validUntil, row.labelEn, row.labelHi, row.active, existing.id,
      ],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.coupon.updated',
      entity: 'event_coupon',
      entityId: String(existing.id),
      meta: { code: row.code, active: row.active },
      ip: clientIp(req),
    });
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/coupons/:id',
  asyncHandler(async (req, res) => {
    const [existing] = await query('SELECT id, code FROM event_coupons WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing) throw new HttpError(404, 'Coupon not found.');
    const [used] = await query('SELECT COUNT(*) AS n FROM event_coupon_uses WHERE coupon_id = ?', [existing.id]);
    if (Number(used.n) > 0) {
      await query('UPDATE event_coupons SET active = 0 WHERE id = ?', [existing.id]);
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'event.coupon.retired',
        entity: 'event_coupon',
        entityId: String(existing.id),
        meta: { code: existing.code, used: Number(used.n) },
        ip: clientIp(req),
      });
      return res.json({ ok: true, retired: true });
    }

    await query('DELETE FROM event_coupons WHERE id = ?', [existing.id]);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.coupon.deleted',
      entity: 'event_coupon',
      entityId: String(existing.id),
      meta: { code: existing.code },
      ip: clientIp(req),
    });
    res.json({ ok: true, retired: false });
  }),
);

/* ------------------------- Admin-issued free passes ------------------------- */

const issueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pass issues in a row. Please wait a few minutes.' },
});

const GUEST_CATEGORIES = ['visitor', 'vip', 'press', 'organiser', 'staff', 'other'];

const issueAttendeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/),
  email: z
    .string()
    .trim()
    .email()
    .max(190)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

const issueSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  ticketTypeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  qty: z.coerce.number().int().min(1).max(20).default(1),
  guestCategory: z.enum(GUEST_CATEGORIES).default('visitor'),
  note: z.string().trim().max(255).optional(),
  attendees: z.array(issueAttendeeSchema).max(19).optional(),
});

adminRouter.post(
  '/bookings/issue',
  issueLimiter,
  asyncHandler(async (req, res) => {
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the pass details.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const settings = await getSalesSettings({ fresh: true });
    if (isSalesClosed(settings)) {
      throw new HttpError(503, 'Online sales are paused. Resume sales before issuing passes so the gate list stays in sync.');
    }

    const extra = input.qty - 1;
    if ((input.attendees?.length ?? 0) !== extra) {
      throw new HttpError(400, 'Name and mobile number are needed for every person on the pass.', {
        attendees: extra === 0 ? 'Remove the extra attendees.' : `Add ${extra} more attendee detail(s).`,
      });
    }

    const [schedule] = await query(
      `SELECT s.*, e.kind, e.name_en AS event_name_en, e.active AS event_active,
              DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1 AS schedule_days,
              (COALESCE(s.sale_ends_at, e.sale_ends_at) IS NOT NULL
                AND COALESCE(s.sale_ends_at, e.sale_ends_at) < NOW()) AS sale_ended
       FROM event_schedules s JOIN events e ON e.id = s.event_id WHERE s.id = ? LIMIT 1`,
      [input.scheduleId],
    );
    if (!schedule || !Number(schedule.active) || !Number(schedule.event_active)) {
      throw new HttpError(404, 'That event schedule is no longer available.');
    }
    if (Number(schedule.sale_ended)) throw new HttpError(409, 'Ticket sales for this city have closed.');

    const [ticket] = await query(
      'SELECT * FROM event_ticket_types WHERE id = ? AND event_id = ? AND active = 1 LIMIT 1',
      [input.ticketTypeId, schedule.event_id],
    );
    if (!ticket) throw new HttpError(400, 'Choose a valid ticket type.');

    const scheduleDays = Math.max(1, Number(schedule.schedule_days) || 1);
    const passDays = Math.max(1, Math.min(Number(ticket.valid_days) || 1, scheduleDays));

    async function insertIssue(reference) {
      return withTransaction(async (conn) => {
        const [capRows] = await conn.execute(
          'SELECT capacity FROM event_schedule_capacities WHERE schedule_id = ? AND ticket_type_id = ? FOR UPDATE',
          [schedule.id, ticket.id],
        );
        if (!capRows[0]) throw new HttpError(409, 'This ticket is not open for this city.');
        const [soldRows] = await conn.execute(
          `SELECT COALESCE(SUM(qty), 0) AS sold FROM event_bookings
           WHERE schedule_id = ? AND ticket_type_id = ?
             AND (status = 'paid' OR (status = 'pending' AND created_at > NOW() - INTERVAL 30 MINUTE))`,
          [schedule.id, ticket.id],
        );
        const left = Number(capRows[0].capacity) - Number(soldRows[0].sold);
        if (left < input.qty) {
          throw new HttpError(409, left > 0 ? `Only ${left} seat(s) left for this ticket.` : 'This ticket is sold out.');
        }

        const pricing = await effectiveUnitPrice(conn, ticket);
        const gross = pricing.price * input.qty;
        const [result] = await conn.execute(
          `INSERT INTO event_bookings
            (reference, event_id, schedule_id, ticket_type_id, name, email, phone, qty, pass_days, unit_price,
             amount, gross_amount, discount_amount, source, guest_category, admin_note, issued_by,
             terms_accepted_at, otp_verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'admin_free', ?, ?, ?, NOW(), NOW())`,
          [
            reference, schedule.event_id, schedule.id, ticket.id,
            input.name, input.email.toLowerCase(), input.phone, input.qty, passDays, pricing.price,
            gross, gross, input.guestCategory, input.note || null, req.admin.id,
          ],
        );
        const bookingId = result.insertId;
        await conn.execute(
          `INSERT INTO event_payments (booking_id, provider, amount, status) VALUES (?, 'admin', 0, 'created')`,
          [bookingId],
        );
        await replaceAttendees(conn, bookingId, [
          { name: input.name, phone: input.phone, email: input.email },
          ...(input.attendees ?? []),
        ]);
        return bookingId;
      });
    }

    let bookingId = null;
    for (let attempt = 0; attempt < 5 && !bookingId; attempt += 1) {
      try {
        bookingId = await insertIssue(makeReference());
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (!bookingId) throw new HttpError(500, 'Could not issue the pass. Please retry.');

    const pass = await activateBooking({
      bookingId,
      provider: 'admin',
      providerRef: `ISSUED-${req.admin.id}`,
      raw: { issuedBy: req.admin.id, note: input.note || null, guestCategory: input.guestCategory },
      ip: clientIp(req),
      actorId: req.admin.id,
      note: input.note || null,
    });

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.issued',
      entity: 'event_booking',
      entityId: String(bookingId),
      meta: {
        reference: pass.reference,
        scheduleId: schedule.id,
        ticketTypeId: ticket.id,
        qty: input.qty,
        guestCategory: input.guestCategory,
        grossAmount: pass.grossAmount ?? 0,
      },
      ip: clientIp(req),
    });

    res.status(201).json({ pass });
  }),
);

/* ------------------------- Booking updates by admin ------------------------- */

const bookingPatchSchema = z.object({
  guestCategory: z.enum(GUEST_CATEGORIES).optional(),
  adminNote: z.string().trim().max(255).nullable().optional(),
  discountAmount: z.coerce.number().int().min(0).max(1000000).optional(),
  attendees: z.array(issueAttendeeSchema).max(19).optional(),
});

adminRouter.patch(
  '/bookings/:id',
  asyncHandler(async (req, res) => {
    const parsed = bookingPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the pass details.', parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;
    if (data.guestCategory === undefined && data.adminNote === undefined && data.discountAmount === undefined && data.attendees === undefined) {
      throw new HttpError(400, 'Nothing to update.');
    }

    const [booking] = await query(
      `SELECT id, reference, status, qty, unit_price, amount, gross_amount, discount_amount,
              name, email, phone
       FROM event_bookings WHERE id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!booking) throw new HttpError(404, 'Booking not found.');

    const sets = [];
    const params = [];
    let amountChange = null;

    if (data.guestCategory !== undefined) {
      sets.push('guest_category = ?');
      params.push(data.guestCategory);
    }
    if (data.adminNote !== undefined) {
      sets.push('admin_note = ?');
      params.push(data.adminNote === '' ? null : data.adminNote);
    }
    if (data.discountAmount !== undefined) {
      if (booking.status !== 'pending') {
        throw new HttpError(409, 'Only an unpaid booking can be re-priced. Refund it first, then issue a new pass.');
      }
      const gross = Number(booking.gross_amount ?? Number(booking.unit_price) * Number(booking.qty));
      if (data.discountAmount > gross) throw new HttpError(400, `The discount cannot exceed the ${gross} rupee fare.`);
      amountChange = gross - data.discountAmount;
      sets.push('gross_amount = ?', 'discount_amount = ?', 'amount = ?');
      params.push(gross, data.discountAmount, amountChange);
    }

    if (data.attendees !== undefined) {
      const extra = Number(booking.qty) - 1;
      if (data.attendees.length !== extra) {
        throw new HttpError(400, 'Name and mobile number are needed for every person after the first.', {
          attendees: `Expected ${extra} extra attendee(s).`,
        });
      }
      await withTransaction(async (conn) => {
        await replaceAttendees(conn, booking.id, [
          { name: booking.name, phone: booking.phone, email: booking.email },
          ...data.attendees,
        ]);
      });
    }

    if (sets.length > 0) {
      await query(`UPDATE event_bookings SET ${sets.join(', ')} WHERE id = ?`, [...params, booking.id]);
    }
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.updated',
      entity: 'event_booking',
      entityId: String(booking.id),
      meta: {
        reference: booking.reference,
        guestCategory: data.guestCategory,
        adminNote: data.adminNote,
        discountAmount: data.discountAmount,
        amount: amountChange,
        rosterChanged: data.attendees !== undefined,
      },
      ip: clientIp(req),
    });

    const row = await loadBookingById(booking.id);
    res.json({ pass: publicPass(row) });
  }),
);

/* ------------------------------ Entry blocks ------------------------------ */

const blockSchema = z.object({
  reference: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(190).optional(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/).optional(),
  name: z.string().trim().max(120).optional(),
  reason: z.string().trim().min(3).max(255),
  scope: z.enum(['all_events', 'event']).default('all_events'),
  eventId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
});

adminRouter.get(
  '/entry-blocks',
  asyncHandler(async (req, res) => {
    const blocks = await listBlocks({
      includeRevoked: req.query.include_revoked === '1',
      search: req.query.q ? String(req.query.q).trim().slice(0, 120) : null,
    });
    res.json({ blocks });
  }),
);

adminRouter.post(
  '/entry-blocks',
  asyncHandler(async (req, res) => {
    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the block details.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;
    if (!input.reference && !input.email && !input.phone) {
      throw new HttpError(400, 'Give the booking reference, email or mobile number to block.');
    }
    if (input.scope === 'event' && !input.eventId) throw new HttpError(400, 'Choose the event this block applies to.');

    let bookingId = null;
    if (input.reference) {
      const [booking] = await query('SELECT id FROM event_bookings WHERE reference = ? LIMIT 1', [input.reference]);
      if (!booking) throw new HttpError(404, 'No booking matches that reference.');
      bookingId = booking.id;
    }

    const block = await createBlock(
      {
        bookingId,
        email: input.email || null,
        phone: input.phone || null,
        name: input.name || null,
        reason: input.reason,
        scope: input.scope,
        eventId: input.eventId ?? null,
      },
      { actorId: req.admin.id, ip: clientIp(req) },
    );
    res.status(201).json({ block });
  }),
);

adminRouter.patch(
  '/entry-blocks/:id',
  asyncHandler(async (req, res) => {
    const active = req.body?.active === true || req.body?.active === 1 || req.body?.active === '1';
    const block = await setBlockActive(req.params.id, active, { actorId: req.admin.id, ip: clientIp(req) });
    res.json({ block });
  }),
);
