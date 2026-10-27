import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, asyncHandler, makeQrToken, makeReference, slugify } from '../lib/util.js';
import { csvCell } from '../lib/csv.js';
import { strongPassword } from '../lib/passwords.js';
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
  moneySql,
  parseBookingFilters,
} from '../lib/eventReports.js';
import { checkInBooking } from '../lib/checkin.js';
import {
  getGateSettings,
  getSalesSettings,
  isSalesClosed,
  saveGateSettings,
  saveSalesSettings,
  smtpConfigured,
} from '../lib/settings.js';
import { getBrand, publicBrand, removeBrandImage, saveBrand, uploadBrandImage } from '../lib/brand.js';
import { invalidateEventPageCache } from '../lib/pageCache.js';
import { effectiveUnitPrice, priceOnDate, priceSlabsByTicket } from '../lib/ticketPricing.js';
import { runReminderSweep } from '../lib/reminders.js';
import { activateBooking, bookingMapUrl, loadBookingById, publicPass, soldBySchedule } from '../lib/eventBookings.js';
import { normalizeCode } from '../lib/offers.js';
import { attendeeEmails, replaceAttendees } from '../lib/attendees.js';
import { createBlock, listBlocks, setBlockActive } from '../lib/entryBlocks.js';
import {
  sendBookingNoticeEmail,
  sendPassEmail,
  sendStaffKycOtpEmail,
  sendWaitlistAnnouncementEmail,
} from '../lib/mailer.js';
import {
  KYC_FILE_COLUMNS,
  maskIdNumber,
  removeKycDir,
  removeKycFile,
  resolveKycFile,
  saveKycFile,
} from '../lib/staffKyc.js';

export const adminRouter = Router();

// A real bcrypt hash so a missing account costs the same time as a wrong password.
const DUMMY_PASSWORD_HASH = '$2a$12$Pxpg1S/41FUOiVswJej/Ju3YELdYQVjJfc0WWdML7Muv6kEmlmJWe';

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

    // Compare first so a disabled or locked account is not distinguishable from a wrong password.
    const ok = await bcrypt.compare(
      parsed.data.password,
      admin?.password_hash || DUMMY_PASSWORD_HASH,
    );
    if (!admin || !ok) {
      if (admin) {
        const attempts = Number(admin.failed_attempts) + 1;
        const lock = attempts >= 5 ? 'DATE_ADD(NOW(), INTERVAL 15 MINUTE)' : 'NULL';
        await query(`UPDATE admins SET failed_attempts = ?, locked_until = ${lock} WHERE id = ?`, [attempts, admin.id]);
        await audit({
          actorType: 'admin',
          actorId: admin.id,
          action: 'admin.login.failed',
          ip: clientIp(req),
        });
      }
      throw new HttpError(401, 'Invalid email or password.');
    }

    if (!Number(admin.active)) throw new HttpError(403, 'This account is disabled. Contact the owner.');
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      throw new HttpError(423, 'This account is temporarily locked. Try again in a few minutes.');
    }

    await query(
      'UPDATE admins SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
      [admin.id],
    );
    await audit({ actorType: 'admin', actorId: admin.id, action: 'admin.login', ip: clientIp(req) });

    const token = signAdminToken(admin);
    setAdminCookie(res, token);
    // The session lives in an httpOnly cookie only — never hand the JWT to page JS.
    res.json({ admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } });
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

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password attempts. Try again in 15 minutes.' },
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: strongPassword,
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password different from the current one.',
    path: ['newPassword'],
  });

adminRouter.post(
  '/me/password',
  requireAdmin,
  passwordLimiter,
  asyncHandler(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter your current password and a stronger new password.', {
        ...parsed.error.flatten().fieldErrors,
      });
    }

    const [admin] = await query('SELECT id, password_hash FROM admins WHERE id = ? AND active = 1 LIMIT 1', [
      req.admin.id,
    ]);
    if (!admin) throw new HttpError(401, 'Your session is no longer valid. Sign in again.');

    const ok = await bcrypt.compare(parsed.data.currentPassword, admin.password_hash);
    if (!ok) throw new HttpError(400, 'The current password is incorrect.');

    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    await query(
      'UPDATE admins SET password_hash = ?, failed_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?',
      [hash, admin.id],
    );

    // Keep this device signed in; every older cookie now fails the version check.
    const [fresh] = await query(
      'SELECT id, email, name, role, token_version FROM admins WHERE id = ? AND active = 1 LIMIT 1',
      [admin.id],
    );
    setAdminCookie(res, signAdminToken(fresh));

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.password_changed',
      entity: 'admin',
      entityId: String(admin.id),
      meta: { other_sessions_revoked: true },
      ip: clientIp(req),
    });

    res.json({ ok: true });
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
  '/settings/gates',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getGateSettings({ fresh: true }) });
  }),
);

adminRouter.put(
  '/settings/gates',
  asyncHandler(async (req, res) => {
    const parsed = z.object({ live_qr_only: z.boolean() }).safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Please check the gate settings.');
    const settings = await saveGateSettings(parsed.data, req.admin.id);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.gate.settings',
      entity: 'app_settings',
      entityId: 'gates',
      meta: { live_qr_only: settings.live_qr_only },
      ip: clientIp(req),
    });
    res.json({ settings });
  }),
);

adminRouter.get(
  '/settings/brand',
  asyncHandler(async (_req, res) => {
    res.json({ brand: publicBrand(await getBrand({ fresh: true })) });
  }),
);

const brandSchema = z.object({
  name_en: z.string().trim().min(2).max(60),
  name_hi: z.string().trim().min(2).max(60),
  tagline_en: z.string().trim().max(90),
  tagline_hi: z.string().trim().max(90),
});

adminRouter.put(
  '/settings/brand',
  asyncHandler(async (req, res) => {
    const parsed = brandSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Please check the branding details.', parsed.error.flatten().fieldErrors);
    const brand = await saveBrand(parsed.data, req.admin.id);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.brand.updated',
      entity: 'app_settings',
      entityId: 'brand',
      meta: { name_en: brand.name_en, name_hi: brand.name_hi },
      ip: clientIp(req),
    });
    res.json({ brand: publicBrand(brand) });
  }),
);

adminRouter.post(
  '/settings/brand/image',
  asyncHandler(async (req, res) => {
    const field = z.enum(['logo', 'favicon']).safeParse(req.body?.field);
    if (!field.success) throw new HttpError(400, 'Choose either the logo or the favicon.');
    const brand = await uploadBrandImage(field.data, req.body?.file, req.admin.id);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.brand.image',
      entity: 'app_settings',
      entityId: 'brand',
      meta: { field: field.data, size: brand[field.data]?.size ?? 0 },
      ip: clientIp(req),
    });
    res.json({ brand: publicBrand(brand) });
  }),
);

adminRouter.delete(
  '/settings/brand/image/:field',
  asyncHandler(async (req, res) => {
    const field = z.enum(['logo', 'favicon']).safeParse(req.params.field);
    if (!field.success) throw new HttpError(400, 'Choose either the logo or the favicon.');
    const brand = await removeBrandImage(field.data, req.admin.id);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.brand.image_removed',
      entity: 'app_settings',
      entityId: 'brand',
      meta: { field: field.data },
      ip: clientIp(req),
    });
    res.json({ brand: publicBrand(brand) });
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

const AUDIT_ACTOR_TYPES = ['admin', 'system', 'public'];

adminRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 25));
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const actorType = AUDIT_ACTOR_TYPES.includes(req.query.actorType) ? req.query.actorType : null;
    const entity = typeof req.query.entity === 'string' ? req.query.entity.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const from = datePattern.test(req.query.from || '') ? req.query.from : null;
    const to = datePattern.test(req.query.to || '') ? req.query.to : null;

    const where = [];
    const params = [];
    if (action) {
      where.push('a.action LIKE ?');
      params.push(`${action}%`);
    }
    if (actorType) {
      where.push('a.actor_type = ?');
      params.push(actorType);
    }
    if (entity) {
      where.push('a.entity = ?');
      params.push(entity);
    }
    if (q) {
      where.push('(a.action LIKE ? OR a.entity LIKE ? OR a.entity_id LIKE ? OR a.ip LIKE ? OR ad.name LIKE ? OR ad.email LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }
    if (from) {
      where.push('a.created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
      params.push(to);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [entries, totals, actionRows, entityRows] = await Promise.all([
      query(
        `SELECT a.id, a.actor_type, a.actor_id, a.action, a.entity, a.entity_id, a.meta, a.ip, a.created_at,
                ad.name AS actor_name, ad.email AS actor_email
         FROM audit_log a LEFT JOIN admins ad ON ad.id = a.actor_id
         ${whereSql}
         ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
      query(
        `SELECT COUNT(*) AS total FROM audit_log a LEFT JOIN admins ad ON ad.id = a.actor_id ${whereSql}`,
        params,
      ),
      query('SELECT DISTINCT action FROM audit_log ORDER BY action'),
      query('SELECT DISTINCT entity FROM audit_log WHERE entity IS NOT NULL ORDER BY entity'),
    ]);

    res.json({
      entries,
      total: Number(totals[0]?.total || 0),
      page,
      pageSize,
      actions: actionRows.map((row) => row.action),
      entities: entityRows.map((row) => row.entity),
    });
  }),
);

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [[totals], byState, byTicket, byEvent, recent, kindRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS bookings,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN qty ELSE 0 END), 0) AS seats,
                COALESCE(SUM(CASE WHEN status <> 'pending' THEN ${moneySql.collected} ELSE 0 END), 0) AS collected,
                COALESCE(SUM(CASE WHEN status <> 'pending' THEN ${moneySql.refunds} ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN status <> 'pending' THEN ${moneySql.net} ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(status = 'pending'), 0) AS pending,
                COALESCE(SUM(check_in_at IS NOT NULL), 0) AS checkins
         FROM event_bookings b`,
      ),
      query(
        `SELECT st.id, st.name_en, st.name_hi,
                COUNT(DISTINCT b.id) AS bookings,
                COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.qty ELSE 0 END), 0) AS seats,
                COALESCE(SUM(CASE WHEN b.status <> 'pending' THEN ${moneySql.collected} ELSE 0 END), 0) AS collected,
                COALESCE(SUM(CASE WHEN b.status <> 'pending' THEN ${moneySql.refunds} ELSE 0 END), 0) AS refunds,
                COALESCE(SUM(CASE WHEN b.status <> 'pending' THEN ${moneySql.net} ELSE 0 END), 0) AS revenue
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
                COALESCE(SUM(CASE WHEN b.status <> 'pending' THEN ${moneySql.net} ELSE 0 END), 0) AS revenue
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
      query('SELECT slug, label_en, label_hi FROM event_kinds'),
    ]);

    const kindLabels = new Map(kindRows.map((kind) => [kind.slug, kind]));
    const withKindLabel = (row) => ({
      ...row,
      kind_label: kindLabels.get(row.kind)?.label_en ?? row.kind,
      kind_label_hi: kindLabels.get(row.kind)?.label_hi ?? row.kind,
    });

    res.json({
      totals: {
        bookings: Number(totals.bookings),
        seats: Number(totals.seats),
        collected: Number(totals.collected),
        refunds: Number(totals.refunds),
        revenue: Number(totals.revenue),
        pending: Number(totals.pending),
        checkins: Number(totals.checkins),
      },
      byState: byState.map((row) => ({
        ...row,
        bookings: Number(row.bookings),
        seats: Number(row.seats),
        collected: Number(row.collected),
        refunds: Number(row.refunds),
        revenue: Number(row.revenue),
      })),
      byTicket: byTicket.map((row) => ({
        ...withKindLabel(row),
        capacity: Number(row.capacity),
        sold: Number(row.sold),
        left: Math.max(0, Number(row.capacity) - Number(row.sold)),
      })),
      byEvent: byEvent.map(withKindLabel),
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
    const [events, tickets, slabsByTicket, kindRows] = await Promise.all([
      query('SELECT * FROM events ORDER BY sort_order, id'),
      query('SELECT * FROM event_ticket_types ORDER BY event_id, sort_order, id'),
      priceSlabsByTicket(),
      query('SELECT slug, label_en, label_hi, layout FROM event_kinds'),
    ]);
    const kinds = new Map(kindRows.map((kind) => [kind.slug, kind]));
    res.json({
      events: events.map((event) => ({
        ...event,
        kind_label: kinds.get(event.kind)?.label_en ?? event.kind,
        kind_label_hi: kinds.get(event.kind)?.label_hi ?? event.kind,
        kind_layout: kinds.get(event.kind)?.layout ?? (event.kind === 'expo' ? 'single' : 'route'),
        tickets: tickets
          .filter((ticket) => ticket.event_id === event.id)
          .map((ticket) => ({ ...ticket, price_slabs: slabsByTicket.get(ticket.id) || [] })),
      })),
    });
  }),
);

/* ----------------------------- Event types ----------------------------- */

const eventKindSchema = z.object({
  label_en: z.string().trim().min(2).max(60),
  label_hi: z.string().trim().min(1).max(80),
  layout: z.enum(['route', 'single']).default('route'),
  slug: z.string().trim().max(32).optional().or(z.literal('')),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  active: z.coerce.number().int().min(0).max(1).default(1),
});

async function kindInUseCount(slug) {
  const [row] = await query('SELECT COUNT(*) AS n FROM events WHERE kind = ?', [slug]);
  return Number(row.n);
}

adminRouter.get(
  '/event-kinds',
  asyncHandler(async (_req, res) => {
    const kinds = await query('SELECT * FROM event_kinds ORDER BY sort_order, slug');
    const usage = await query('SELECT kind, COUNT(*) AS n FROM events GROUP BY kind');
    const byKind = new Map(usage.map((row) => [row.kind, Number(row.n)]));
    res.json({ kinds: kinds.map((kind) => ({ ...kind, event_count: byKind.get(kind.slug) ?? 0 })) });
  }),
);

adminRouter.post(
  '/event-kinds',
  asyncHandler(async (req, res) => {
    const parsed = eventKindSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the event type fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const base = slugify(d.slug || d.label_en, 'type');
    if (!base) throw new HttpError(400, 'Give the type a name that can be used as an address.');
    let slug = base;
    for (let attempt = 2; ; attempt += 1) {
      const [taken] = await query('SELECT slug FROM event_kinds WHERE slug = ? LIMIT 1', [slug]);
      if (!taken) break;
      slug = `${base.slice(0, 26)}-${attempt}`;
    }

    await query(
      `INSERT INTO event_kinds (slug, label_en, label_hi, layout, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slug, d.label_en, d.label_hi, d.layout, d.sort_order, d.active],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event_kind.created',
      entity: 'event_kind',
      entityId: slug,
      meta: { label_en: d.label_en, layout: d.layout },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.status(201).json({ slug });
  }),
);

adminRouter.put(
  '/event-kinds/:slug',
  asyncHandler(async (req, res) => {
    const parsed = eventKindSchema.safeParse({ ...req.body, slug: req.params.slug });
    if (!parsed.success) throw new HttpError(400, 'Check the event type fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const [existing] = await query('SELECT slug, sort_order FROM event_kinds WHERE slug = ? LIMIT 1', [req.params.slug]);
    if (!existing) throw new HttpError(404, 'Event type not found.');

    // The edit form does not carry sort_order, so an omitted value must not send the type to the top.
    const sortOrder =
      req.body?.sort_order === undefined || req.body?.sort_order === null || req.body?.sort_order === ''
        ? Number(existing.sort_order)
        : d.sort_order;

    await query(
      `UPDATE event_kinds SET label_en = ?, label_hi = ?, layout = ?, sort_order = ?, active = ? WHERE slug = ?`,
      [d.label_en, d.label_hi, d.layout, sortOrder, d.active, req.params.slug],
    );
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event_kind.updated',
      entity: 'event_kind',
      entityId: req.params.slug,
      meta: { label_en: d.label_en, layout: d.layout },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/event-kinds/:slug',
  asyncHandler(async (req, res) => {
    const [existing] = await query('SELECT slug FROM event_kinds WHERE slug = ? LIMIT 1', [req.params.slug]);
    if (!existing) throw new HttpError(404, 'Event type not found.');

    const used = await kindInUseCount(req.params.slug);
    if (used > 0) {
      throw new HttpError(409, `${used} event${used === 1 ? '' : 's'} still uses this type — move them first.`);
    }

    await query('DELETE FROM event_kinds WHERE slug = ?', [req.params.slug]);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event_kind.deleted',
      entity: 'event_kind',
      entityId: req.params.slug,
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.json({ ok: true });
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

const eventCreateSchema = eventSchema.extend({
  kind: z.string().trim().toLowerCase().max(32).default('yatra'),
  slug: z.string().trim().max(64).optional().or(z.literal('')),
});

adminRouter.post(
  '/events',
  asyncHandler(async (req, res) => {
    const parsed = eventCreateSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Check the event fields.', parsed.error.flatten().fieldErrors);
    const d = parsed.data;

    const [kindRow] = await query('SELECT slug FROM event_kinds WHERE slug = ? AND active = 1 LIMIT 1', [d.kind]);
    if (!kindRow) throw new HttpError(400, 'Choose an event type that is turned on.');

    const base = slugify(d.slug || d.name_en, 'event');
    let slug = base;
    for (let attempt = 2; ; attempt += 1) {
      const [taken] = await query('SELECT id FROM events WHERE slug = ? LIMIT 1', [slug]);
      if (!taken) break;
      slug = `${base.slice(0, 52)}-${attempt}`;
    }

    const [last] = await query('SELECT COALESCE(MAX(sort_order), 0) AS sort FROM events');
    const result = await query(
      `INSERT INTO events
        (slug, kind, name_en, name_hi, tagline_en, tagline_hi, description_en, description_hi,
         date_label_en, date_label_hi, starts_on, ends_on, sale_ends_at, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug, d.kind, d.name_en, d.name_hi, d.tagline_en, d.tagline_hi,
        d.description_en || null, d.description_hi || null,
        d.date_label_en, d.date_label_hi, d.starts_on || null, d.ends_on || null,
        toDateTime(d.sale_ends_at), d.active, Number(last.sort) + 1,
      ],
    );

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.created',
      entity: 'event',
      entityId: String(result.insertId),
      meta: { slug, kind: d.kind },
      ip: clientIp(req),
    });
    invalidateEventPageCache();
    res.status(201).json({ id: result.insertId, slug });
  }),
);

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
    const [rows, summary] = await Promise.all([
      fetchAdminBookings(filters, limit),
      bookingSummary(filters),
    ]);
    const bookings = rows.map((row) => {
      const list = (value) => {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        try {
          const parsed = JSON.parse(String(value));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      return {
        ...row,
        collected_amount: Number(row.collected_amount || 0),
        refunds_total: Number(row.refunds_total || 0),
        net_amount: Number(row.net_amount || 0),
        captured_amount: Number(row.captured_amount || 0),
        attendees: list(row.attendees_json),
        adjustments: list(row.adjustments_json),
      };
    });
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
    const gate = req.body?.gate ? String(req.body.gate) : undefined;
    const result = await checkInBooking({
      code,
      actor: req.admin,
      ip: clientIp(req),
      gate,
      positions: Array.isArray(req.body?.positions) ? req.body.positions : undefined,
    });
    res.json(result);
  }),
);

/* Duplicate-scan alerts: rejected gate attempts on today's paid passes. */
adminRouter.get(
  '/scan-alerts',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT d.booking_id, d.reference, b.name, b.guest_category, d.reason,
              COUNT(*) AS attempts,
              GROUP_CONCAT(DISTINCT COALESCE(d.gate, 'Unlabelled gate') ORDER BY d.gate SEPARATOR ', ') AS gates,
              MIN(d.created_at) AS first_at, MAX(d.created_at) AS last_at,
              (SELECT c.gate FROM event_booking_checkins c
                WHERE c.booking_id = d.booking_id AND c.entry_date = CURDATE()
                ORDER BY c.created_at DESC LIMIT 1) AS entry_gate,
              (SELECT a.name FROM event_booking_checkins c2
                 JOIN admins a ON a.id = c2.checked_in_by
                WHERE c2.booking_id = d.booking_id AND c2.entry_date = CURDATE()
                ORDER BY c2.created_at DESC LIMIT 1) AS entry_staff
       FROM event_scan_denials d
       JOIN event_bookings b ON b.id = d.booking_id
       WHERE d.entry_date = CURDATE()
         AND d.reason IN ('already_scanned', 'entries_exhausted')
       GROUP BY d.booking_id, d.reference, b.name, b.guest_category, d.reason
       HAVING attempts >= 1
       ORDER BY last_at DESC
       LIMIT 40`,
    );
    res.json({ alerts: rows, thresholds: { otherGate: 1, repeat: 3 } });
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

adminRouter.get(
  '/waitlist/export.csv',
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
    const rows = await query(
      `SELECT w.ref, s.name_en AS state_en, s.code AS state_code, w.name, w.email, w.phone,
              w.status, w.verified_at, w.created_at
       FROM event_state_waitlist w JOIN event_states s ON s.id = w.state_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.name_en ASC, w.id DESC`,
      params,
    );
    const lines = [
      ['Reference', 'State', 'State code', 'Name', 'Email', 'Phone', 'Status', 'Verified at', 'Joined at'],
      ...rows.map((row) => [
        row.ref,
        row.state_en,
        row.state_code,
        row.name,
        row.email,
        row.phone || '',
        row.status,
        row.verified_at ? new Date(row.verified_at).toISOString() : '',
        row.created_at ? new Date(row.created_at).toISOString() : '',
      ]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="adhyatmik-waitlist-${stamp}.csv"`);
    res.send(`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`);
  }),
);

const waitlistMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many waitlist broadcasts. Wait a few minutes before sending another.' },
});

const waitlistMessageSchema = z.object({
  stateId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  subject: z.string().trim().min(3, 'Write a subject of at least 3 characters.').max(120),
  message: z.string().trim().min(10, 'Write a message of at least 10 characters.').max(4000),
});

adminRouter.post(
  '/waitlist/message',
  waitlistMessageLimiter,
  asyncHandler(async (req, res) => {
    const parsed = waitlistMessageSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message || 'Check the subject and message.');
    const { stateId = null, subject, message } = parsed.data;

    const rows = await query(
      `SELECT w.id, w.ref, w.name, w.email, s.name_en AS state_en
       FROM event_state_waitlist w JOIN event_states s ON s.id = w.state_id
       WHERE w.status = 'verified' ${stateId ? 'AND w.state_id = ?' : ''}
       ORDER BY w.id ASC LIMIT 500`,
      stateId ? [stateId] : [],
    );

    const seen = new Set();
    const recipients = [];
    for (const row of rows) {
      const email = String(row.email).toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push(row);
    }
    if (recipients.length === 0) {
      throw new HttpError(400, 'No verified waitlist emails match this selection yet.');
    }

    let sent = 0;
    let logged = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        const result = await sendWaitlistAnnouncementEmail({
          to: recipient.email,
          name: recipient.name,
          stateName: recipient.state_en,
          subject,
          message,
          waitlistRef: recipient.ref,
        });
        if (result.delivered) sent += 1;
        else logged += 1;
      } catch {
        failed += 1;
      }
    }

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.waitlist.messaged',
      entity: 'event_state_waitlist',
      meta: { stateId, subject, recipients: recipients.length, sent, logged, failed },
      ip: clientIp(req),
    });

    res.json({
      recipients: recipients.length,
      sent,
      logged,
      failed,
      emailConfigured: smtpConfigured(),
    });
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

const KYC_SELECT = `a.id, a.email, a.name, a.role, a.active, a.last_login_at, a.created_at,
       k.mobile, k.mobile_verified_at, k.email_verified_at, k.doc_type,
       k.aadhaar_number, k.pan_number, k.other_doc_no,
       k.aadhaar_photo, k.pan_photo, k.other_doc_photo,
       k.status AS kyc_status, k.notes AS kyc_notes, k.verified_at AS kyc_verified_at,
       k.updated_at AS kyc_updated_at, v.name AS verified_by_name`;

const KYC_FROM = `FROM admins a
       LEFT JOIN staff_kyc k ON k.admin_id = a.id
       LEFT JOIN admins v ON v.id = k.verified_by`;

function kycPayload(row, { reveal = false } = {}) {
  return {
    adminId: row.id,
    email: row.email,
    name: row.name,
    active: Number(row.active),
    mobile: row.mobile ?? null,
    mobileVerifiedAt: row.mobile_verified_at ?? null,
    emailVerifiedAt: row.email_verified_at ?? null,
    docType: row.doc_type ?? 'aadhaar',
    aadhaarMasked: maskIdNumber(row.aadhaar_number),
    panMasked: maskIdNumber(row.pan_number),
    otherDocNo: row.other_doc_no ?? null,
    status: row.kyc_status ?? 'pending',
    notes: row.kyc_notes ?? null,
    verifiedAt: row.kyc_verified_at ?? null,
    verifiedByName: row.verified_by_name ?? null,
    files: {
      aadhaar: Boolean(row.aadhaar_photo),
      pan: Boolean(row.pan_photo),
      other: Boolean(row.other_doc_photo),
    },
    updatedAt: row.kyc_updated_at ?? null,
    ...(reveal ? { aadhaarNumber: row.aadhaar_number ?? null, panNumber: row.pan_number ?? null } : {}),
  };
}

async function loadStaffKyc(id) {
  const rows = await query(`${`SELECT ${KYC_SELECT} ${KYC_FROM}`} WHERE a.id = ? AND a.role = 'staff' LIMIT 1`, [id]);
  return rows[0] ?? null;
}

adminRouter.get(
  '/staff',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT ${KYC_SELECT},
              (SELECT COUNT(*) FROM event_booking_checkins ci WHERE ci.checked_in_by = a.id) AS checkins
       ${KYC_FROM}
       WHERE a.role = 'staff' ORDER BY a.id DESC`,
    );
    res.json({
      staff: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        active: row.active,
        last_login_at: row.last_login_at,
        created_at: row.created_at,
        checkins: Number(row.checkins),
        kyc: {
          status: row.kyc_status ?? 'pending',
          mobile: row.mobile ?? null,
          docType: row.doc_type ?? 'aadhaar',
          idMasked: maskIdNumber(row.aadhaar_number || row.pan_number || row.other_doc_no),
          hasDocs: Boolean(row.aadhaar_photo || row.pan_photo || row.other_doc_photo),
          emailVerifiedAt: row.email_verified_at ?? null,
          verifiedAt: row.kyc_verified_at ?? null,
        },
      })),
    });
  }),
);

const staffSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  password: strongPassword,
});

const passwordSchema = z.object({
  password: strongPassword,
});

adminRouter.post(
  '/staff',
  asyncHandler(async (req, res) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter a name, a valid email and a strong password.', {
        ...parsed.error.flatten().fieldErrors,
      });
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
    if (active === 0) {
      sets.push('active = 0', 'token_version = token_version + 1');
    } else if (active === 1) {
      sets.push('active = ?');
      params.push(active);
    }
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
    if (!parsed.success) throw new HttpError(400, 'That password is not strong enough.', {
      ...parsed.error.flatten().fieldErrors,
    });
    const hash = await bcrypt.hash(parsed.data.password, 12);
    const result = await query(
      `UPDATE admins SET password_hash = ?, failed_attempts = 0, locked_until = NULL,
              token_version = token_version + 1
       WHERE id = ? AND role = 'staff'`,
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
    const [staff] = await query(
      `SELECT id, email, name FROM admins WHERE id = ? AND role = 'staff' LIMIT 1`,
      [req.params.id],
    );
    if (!staff) throw new HttpError(404, 'Staff account not found.');

    if (req.query.purge === '1') {
      const [usage] = await query(
        'SELECT COUNT(*) AS n FROM event_booking_checkins WHERE checked_in_by = ?',
        [staff.id],
      );
      if (Number(usage.n) > 0) {
        throw new HttpError(
          409,
          'This account has gate check-ins. Disable it instead so the check-in history keeps its staff name.',
        );
      }
      await query(`DELETE FROM admins WHERE id = ? AND role = 'staff'`, [staff.id]);
      await removeKycDir(staff.id);
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'staff.purged',
        entity: 'admin',
        entityId: String(staff.id),
        meta: { email: staff.email, name: staff.name },
        ip: clientIp(req),
      });
      return res.json({ ok: true, purged: true });
    }

    await query(`UPDATE admins SET active = 0, token_version = token_version + 1 WHERE id = ? AND role = 'staff'`, [
      staff.id,
    ]);
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.disabled',
      entity: 'admin',
      entityId: String(staff.id),
      meta: { email: staff.email },
      ip: clientIp(req),
    });
    res.json({ ok: true, purged: false });
  }),
);

/* ------------------------------ Staff KYC ------------------------------ */

const kycOtpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification codes requested. Wait a few minutes and try again.' },
});

const optionalIdNumber = (regex, message) =>
  z
    .union([z.string().trim().regex(regex, message), z.literal(''), z.null()])
    .optional();

const staffKycSchema = z.object({
  mobile: optionalIdNumber(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  docType: z.enum(['aadhaar', 'pan', 'voter_id', 'driving_licence', 'other']).optional(),
  aadhaarNumber: optionalIdNumber(/^\d{12}$/, 'An Aadhaar number has 12 digits'),
  panNumber: optionalIdNumber(/^[A-Za-z]{5}\d{4}[A-Za-z]$/, 'A PAN is 10 characters like ABCDE1234F'),
  otherDocNo: z.union([z.string().trim().max(60), z.literal(''), z.null()]).optional(),
  notes: z.union([z.string().trim().max(255), z.literal(''), z.null()]).optional(),
});

const kycStatusSchema = z.object({
  status: z.enum(['verified', 'rejected', 'pending']),
  notes: z.union([z.string().trim().max(255), z.literal(''), z.null()]).optional(),
});

const kycOtpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

const DOC_LABELS = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  voter_id: 'Voter ID',
  driving_licence: 'Driving licence',
  other: 'identity document',
};

function requiredDocFor(docType) {
  if (docType === 'aadhaar') return { number: 'aadhaar_number', photo: 'aadhaar_photo', label: 'Aadhaar' };
  if (docType === 'pan') return { number: 'pan_number', photo: 'pan_photo', label: 'PAN' };
  return { number: 'other_doc_no', photo: 'other_doc_photo', label: DOC_LABELS[docType] ?? 'identity document' };
}

adminRouter.get(
  '/staff/:id/kyc',
  asyncHandler(async (req, res) => {
    const row = await loadStaffKyc(req.params.id);
    if (!row) throw new HttpError(404, 'Staff account not found.');
    const reveal = req.query.reveal === '1';
    if (reveal) {
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'staff.kyc.revealed',
        entity: 'admin',
        entityId: String(row.id),
        meta: { email: row.email },
        ip: clientIp(req),
      });
    }
    res.json({ kyc: kycPayload(row, { reveal }) });
  }),
);

adminRouter.put(
  '/staff/:id/kyc',
  asyncHandler(async (req, res) => {
    const parsed = staffKycSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the KYC details.', parsed.error.flatten().fieldErrors);
    }
    const staff = await loadStaffKyc(req.params.id);
    if (!staff) throw new HttpError(404, 'Staff account not found.');

    const data = parsed.data;
    const normalized = (value) => (value === undefined ? undefined : value === '' ? null : value);
    const next = {
      mobile: normalized(data.mobile) === undefined ? staff.mobile ?? null : normalized(data.mobile),
      docType: data.docType ?? staff.doc_type ?? 'aadhaar',
      aadhaarNumber:
        normalized(data.aadhaarNumber) === undefined
          ? staff.aadhaar_number ?? null
          : normalized(data.aadhaarNumber),
      panNumber:
        normalized(data.panNumber) === undefined
          ? staff.pan_number ?? null
          : normalized(data.panNumber)?.toUpperCase() ?? null,
      otherDocNo:
        normalized(data.otherDocNo) === undefined ? staff.other_doc_no ?? null : normalized(data.otherDocNo),
      notes: normalized(data.notes) === undefined ? staff.kyc_notes ?? null : normalized(data.notes),
    };

    const identityChanged =
      next.docType !== (staff.doc_type ?? 'aadhaar') ||
      next.aadhaarNumber !== (staff.aadhaar_number ?? null) ||
      next.panNumber !== (staff.pan_number ?? null) ||
      next.otherDocNo !== (staff.other_doc_no ?? null);

    const currentStatus = staff.kyc_status ?? 'pending';
    const hasAnyDoc = Boolean(next.aadhaarNumber || next.panNumber || next.otherDocNo);
    let status = currentStatus;
    if (identityChanged && (currentStatus === 'verified' || currentStatus === 'rejected')) {
      status = hasAnyDoc ? 'docs_uploaded' : 'pending';
    } else if (currentStatus !== 'verified' && currentStatus !== 'rejected') {
      status = hasAnyDoc ? 'docs_uploaded' : 'pending';
    }

    await query(
      `INSERT INTO staff_kyc (admin_id, mobile, doc_type, aadhaar_number, pan_number, other_doc_no, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mobile = VALUES(mobile), doc_type = VALUES(doc_type),
         aadhaar_number = VALUES(aadhaar_number), pan_number = VALUES(pan_number),
         other_doc_no = VALUES(other_doc_no), notes = VALUES(notes), status = VALUES(status)`,
      [
        staff.id,
        next.mobile,
        next.docType,
        next.aadhaarNumber,
        next.panNumber,
        next.otherDocNo,
        next.notes,
        status,
      ],
    );

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.kyc.updated',
      entity: 'admin',
      entityId: String(staff.id),
      meta: {
        email: staff.email,
        docType: next.docType,
        status,
        identityChanged,
        hasMobile: Boolean(next.mobile),
      },
      ip: clientIp(req),
    });

    const fresh = await loadStaffKyc(staff.id);
    res.json({ kyc: kycPayload(fresh) });
  }),
);

adminRouter.post(
  '/staff/:id/kyc/file/:kind',
  asyncHandler(async (req, res) => {
    const kind = String(req.params.kind);
    const column = KYC_FILE_COLUMNS[kind];
    if (!column) throw new HttpError(404, 'Unknown document type.');

    const [staff] = await query(
      `SELECT id, email, name FROM admins WHERE id = ? AND role = 'staff' LIMIT 1`,
      [req.params.id],
    );
    if (!staff) throw new HttpError(404, 'Staff account not found.');

    const [existing] = await query(
      `SELECT ${column} AS path FROM staff_kyc WHERE admin_id = ? LIMIT 1`,
      [staff.id],
    );
    const storedPath = await saveKycFile(staff.id, kind, req.body);

    await query(
      `INSERT INTO staff_kyc (admin_id, ${column}, status) VALUES (?, ?, 'docs_uploaded')
       ON DUPLICATE KEY UPDATE ${column} = VALUES(${column}),
         status = IF(status IN ('pending','otp_pending','rejected'), 'docs_uploaded', status)`,
      [staff.id, storedPath],
    );
    if (existing?.path) await removeKycFile(existing.path);

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.kyc.document_uploaded',
      entity: 'admin',
      entityId: String(staff.id),
      meta: { email: staff.email, kind },
      ip: clientIp(req),
    });

    const fresh = await loadStaffKyc(staff.id);
    res.status(201).json({ ok: true, kyc: kycPayload(fresh) });
  }),
);

adminRouter.get(
  '/staff/:id/kyc/file/:kind',
  asyncHandler(async (req, res) => {
    const kind = String(req.params.kind);
    const column = KYC_FILE_COLUMNS[kind];
    if (!column) throw new HttpError(404, 'Unknown document type.');

    const [row] = await query(
      `SELECT k.${column} AS path, k.admin_id AS staff_id, a.email FROM staff_kyc k
       JOIN admins a ON a.id = k.admin_id
       WHERE k.admin_id = ? AND a.role = 'staff' LIMIT 1`,
      [req.params.id],
    );
    const absolute = resolveKycFile(row?.path);
    if (!absolute) throw new HttpError(404, 'No document uploaded for this type.');

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.kyc.document_viewed',
      entity: 'admin',
      entityId: String(req.params.id),
      meta: { email: row.email, kind },
      ip: clientIp(req),
    });

    // KYC documents are personal data: never cached, never rendered inline by the browser.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="staff-${Number(row.staff_id)}-${kind}.${path.extname(absolute).slice(1)}"`,
    );
    res.sendFile(absolute);
  }),
);

adminRouter.patch(
  '/staff/:id/kyc/status',
  asyncHandler(async (req, res) => {
    const parsed = kycStatusSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Choose a valid KYC status.');
    const { status } = parsed.data;
    const notes = parsed.data.notes === undefined ? undefined : parsed.data.notes || null;

    const [row] = await query('SELECT * FROM staff_kyc WHERE admin_id = ? LIMIT 1', [req.params.id]);
    if (!row) throw new HttpError(404, 'Save the staff identity details first.');

    if (status === 'verified') {
      const doc = requiredDocFor(row.doc_type ?? 'aadhaar');
      if (!row[doc.number]) {
        throw new HttpError(400, `Add the ${doc.label} number before marking KYC verified.`);
      }
      if (!row[doc.photo]) {
        throw new HttpError(400, `Upload a scan of the ${doc.label} before marking KYC verified.`);
      }
    }
    if (status === 'rejected' && (!notes || notes.trim().length < 3)) {
      throw new HttpError(400, 'Add a short reason for rejecting the KYC.');
    }

    await query(
      `UPDATE staff_kyc SET status = ?, notes = COALESCE(?, notes),
              verified_by = ?, verified_at = ?
       WHERE admin_id = ?`,
      [status, notes ?? null, status === 'verified' ? req.admin.id : null, status === 'verified' ? new Date() : null, row.admin_id],
    );

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: status === 'verified' ? 'staff.kyc.verified' : status === 'rejected' ? 'staff.kyc.rejected' : 'staff.kyc.reopened',
      entity: 'admin',
      entityId: String(row.admin_id),
      meta: { notes: notes ?? null },
      ip: clientIp(req),
    });

    const fresh = await loadStaffKyc(row.admin_id);
    res.json({ kyc: kycPayload(fresh) });
  }),
);

adminRouter.post(
  '/staff/:id/kyc/otp',
  kycOtpLimiter,
  asyncHandler(async (req, res) => {
    const [staff] = await query(
      `SELECT id, email, name, active FROM admins WHERE id = ? AND role = 'staff' LIMIT 1`,
      [req.params.id],
    );
    if (!staff) throw new HttpError(404, 'Staff account not found.');
    if (!Number(staff.active)) throw new HttpError(409, 'Enable the account before verifying its email.');

    const [recent] = await query(
      `SELECT COUNT(*) AS n FROM staff_kyc_otps
       WHERE admin_id = ? AND purpose = 'email' AND created_at > NOW() - INTERVAL 10 MINUTE`,
      [staff.id],
    );
    if (Number(recent.n) >= 3) {
      throw new HttpError(429, 'Three codes were already sent in the last 10 minutes. Wait before requesting another.');
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    await query(
      `UPDATE staff_kyc_otps SET consumed_at = NOW()
       WHERE admin_id = ? AND purpose = 'email' AND consumed_at IS NULL`,
      [staff.id],
    );
    await query(
      `INSERT INTO staff_kyc_otps (admin_id, purpose, code_hash, expires_at)
       VALUES (?, 'email', ?, NOW() + INTERVAL 10 MINUTE)`,
      [staff.id, codeHash],
    );

    let delivered = false;
    try {
      const sent = await sendStaffKycOtpEmail({ to: staff.email, code, staffName: staff.name });
      delivered = Boolean(sent?.delivered);
    } catch {
      throw new HttpError(
        502,
        'The verification email could not be sent. Check the SMTP settings, or read the code from the server log.',
      );
    }

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.kyc.otp_sent',
      entity: 'admin',
      entityId: String(staff.id),
      meta: { email: staff.email, delivered },
      ip: clientIp(req),
    });

    res.json({ ok: true, delivered });
  }),
);

adminRouter.post(
  '/staff/:id/kyc/otp/verify',
  asyncHandler(async (req, res) => {
    const parsed = kycOtpSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Enter the 6-digit code from the email.');

    const [staff] = await query(
      `SELECT id, email FROM admins WHERE id = ? AND role = 'staff' LIMIT 1`,
      [req.params.id],
    );
    if (!staff) throw new HttpError(404, 'Staff account not found.');

    const [otp] = await query(
      `SELECT id, code_hash, attempts, expires_at FROM staff_kyc_otps
       WHERE admin_id = ? AND purpose = 'email' AND consumed_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [staff.id],
    );
    if (!otp) throw new HttpError(400, 'Request a new verification code.');

    if (new Date(String(otp.expires_at).replace(' ', 'T')) < new Date()) {
      await query('UPDATE staff_kyc_otps SET consumed_at = NOW() WHERE id = ?', [otp.id]);
      throw new HttpError(400, 'That code has expired. Send a new one.');
    }
    if (Number(otp.attempts) >= 5) {
      await query('UPDATE staff_kyc_otps SET consumed_at = NOW() WHERE id = ?', [otp.id]);
      throw new HttpError(400, 'Too many wrong attempts. Send a new code.');
    }

    const matches = await bcrypt.compare(parsed.data.code, otp.code_hash);
    if (!matches) {
      await query('UPDATE staff_kyc_otps SET attempts = attempts + 1 WHERE id = ?', [otp.id]);
      throw new HttpError(400, 'That code is not correct.');
    }

    await query('UPDATE staff_kyc_otps SET consumed_at = NOW() WHERE id = ?', [otp.id]);
    await query(
      `INSERT INTO staff_kyc (admin_id, email_verified_at) VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE email_verified_at = NOW()`,
      [staff.id],
    );

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'staff.kyc.otp_verified',
      entity: 'admin',
      entityId: String(staff.id),
      meta: { email: staff.email },
      ip: clientIp(req),
    });

    const fresh = await loadStaffKyc(staff.id);
    res.json({ ok: true, kyc: kycPayload(fresh) });
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

/* ------------------------------- Pass resend ------------------------------- */

const resendPassSchema = z.object({
  email: z.string().trim().email().max(190).optional(),
});

adminRouter.post(
  '/bookings/:id/resend',
  asyncHandler(async (req, res) => {
    const parsed = resendPassSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'Enter the corrected email address, or leave it blank to use the booking email.');
    }

    const row = await loadBookingById(req.params.id);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (row.status !== 'paid') {
      throw new HttpError(409, 'Only a paid pass can be resent. Issue a new pass if this booking was cancelled.');
    }

    const pass = publicPass(row);
    const to = parsed.data.email ? parsed.data.email.toLowerCase() : row.email;
    const delivery = await sendPassEmail({
      to,
      name: row.name,
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
      attendees: pass.attendees,
      bookingId: row.id,
    });

    if (delivery.delivered) {
      await query('UPDATE event_bookings SET pass_sent_at = NOW() WHERE id = ?', [row.id]);
    }
    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.pass.resent',
      entity: 'event_booking',
      entityId: String(row.id),
      meta: { reference: row.reference, to, delivered: delivery.delivered },
      ip: clientIp(req),
    });

    res.json({
      delivered: delivery.delivered,
      to,
      emailConfigured: smtpConfigured(),
      pass: publicPass(await loadBookingById(row.id)),
    });
  }),
);

/* ------------------------------ Booking changes ------------------------------ */

adminRouter.get(
  '/bookings/:id/amend-options',
  asyncHandler(async (req, res) => {
    const row = await loadBookingById(req.params.id);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (row.status !== 'paid') throw new HttpError(409, 'Only a paid pass can be changed.');
    if (Number(row.check_in_count) > 0) {
      throw new HttpError(409, 'This pass has already been scanned at the gate, so it can no longer be changed.');
    }

    const [schedules, tickets, capacityRows] = await Promise.all([
      query(
        `SELECT s.id, s.event_date, s.end_date, s.start_time, s.end_time,
                DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1 AS schedule_days,
                st.name_en AS state_en, c.name_en AS city_en, v.name_en AS venue_en
         FROM event_schedules s
         JOIN event_states st ON st.id = s.state_id
         JOIN event_cities c ON c.id = s.city_id
         JOIN event_venues v ON v.id = s.venue_id
         WHERE s.event_id = ? AND s.active = 1
         ORDER BY s.event_date, c.name_en`,
        [row.event_id],
      ),
      query(
        `SELECT id, name_en, name_hi, price, original_price, valid_days
         FROM event_ticket_types WHERE event_id = ? AND active = 1 ORDER BY sort_order, id`,
        [row.event_id],
      ),
      query(
        `SELECT c.schedule_id, c.ticket_type_id, c.capacity
         FROM event_schedule_capacities c
         JOIN event_schedules s ON s.id = c.schedule_id
         WHERE s.event_id = ? AND s.active = 1`,
        [row.event_id],
      ),
    ]);

    const [sold, slabs] = await Promise.all([soldBySchedule(), priceSlabsByTicket()]);
    const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]));

    const scheduleOptions = schedules
      .map((schedule) => {
        const options = capacityRows
          .filter((capacity) => Number(capacity.schedule_id) === Number(schedule.id))
          .map((capacity) => {
            const ticket = ticketById.get(Number(capacity.ticket_type_id));
            if (!ticket) return null;
            const pricing = priceOnDate(ticket, slabs.get(ticket.id) ?? []);
            let left =
              Number(capacity.capacity) - (sold.get(`${schedule.id}:${ticket.id}`) ?? 0);
            // The booking's own seats already count as sold when it is looking at its current option.
            if (Number(schedule.id) === Number(row.schedule_id) && Number(ticket.id) === Number(row.ticket_type_id)) {
              left += Number(row.qty);
            }
            const scheduleDays = Math.max(1, Number(schedule.schedule_days) || 1);
            const passDays = Math.max(1, Math.min(Number(ticket.valid_days) || 1, scheduleDays));
            return {
              ticketTypeId: Number(ticket.id),
              name_en: ticket.name_en,
              name_hi: ticket.name_hi,
              price: pricing.price,
              listPrice: pricing.list_price,
              left: Math.max(0, left),
              validDays: Number(ticket.valid_days) || 1,
              passDays,
            };
          })
          .filter(Boolean);
        return {
          scheduleId: Number(schedule.id),
          eventDate: schedule.event_date,
          endDate: schedule.end_date,
          startTime: schedule.start_time,
          endTime: schedule.end_time,
          state_en: schedule.state_en,
          city_en: schedule.city_en,
          venue_en: schedule.venue_en,
          tickets: options,
        };
      })
      .filter((schedule) => schedule.tickets.length > 0);

    res.json({
      booking: {
        id: Number(row.id),
        reference: row.reference,
        scheduleId: Number(row.schedule_id),
        ticketTypeId: Number(row.ticket_type_id),
        qty: Number(row.qty),
        amount: Number(row.amount),
        grossAmount: Number(row.gross_amount ?? Number(row.unit_price) * Number(row.qty)),
        discountAmount: Number(row.discount_amount || 0),
        attendees: publicPass(row).attendees,
      },
      schedules: scheduleOptions,
    });
  }),
);

const amendBookingSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  ticketTypeId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).max(20),
  reason: z.string().trim().min(3).max(255),
  paymentReference: z.string().trim().max(120).optional(),
  // A cheaper ticket or fewer seats releases money; record how much went back, when.
  refundAmount: z.coerce.number().int().min(0).max(10000000).optional(),
  refundReference: z.string().trim().max(120).optional(),
  attendees: z.array(issueAttendeeSchema).max(19).default([]),
});

adminRouter.post(
  '/bookings/:id/amend',
  asyncHandler(async (req, res) => {
    const parsed = amendBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the changed pass details.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const booking = await loadBookingById(req.params.id);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'paid') throw new HttpError(409, 'Only a paid pass can be changed.');
    if (Number(booking.check_in_count) > 0) {
      throw new HttpError(409, 'This pass has already been scanned at the gate, so it can no longer be changed.');
    }

    const [schedule] = await query(
      `SELECT s.*, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1 AS schedule_days,
              e.active AS event_active
       FROM event_schedules s JOIN events e ON e.id = s.event_id
       WHERE s.id = ? LIMIT 1`,
      [input.scheduleId],
    );
    if (!schedule || !Number(schedule.active) || !Number(schedule.event_active)) {
      throw new HttpError(404, 'That city and date are no longer available.');
    }
    if (Number(schedule.event_id) !== Number(booking.event_id)) {
      throw new HttpError(400, 'Choose a city and date from the same event.');
    }

    const [ticket] = await query(
      'SELECT * FROM event_ticket_types WHERE id = ? AND event_id = ? AND active = 1 LIMIT 1',
      [input.ticketTypeId, booking.event_id],
    );
    if (!ticket) throw new HttpError(400, 'Choose a valid ticket type for this event.');

    const extra = input.qty - 1;
    if (input.attendees.length !== extra) {
      throw new HttpError(400, 'Name and mobile number are needed for every person after the first.', {
        attendees: extra === 0 ? 'Remove the extra attendees.' : `Add ${extra} more attendee detail(s).`,
      });
    }

    const outcome = await withTransaction(async (conn) => {
      const [lockedRows] = await conn.execute(
        'SELECT status FROM event_bookings WHERE id = ? FOR UPDATE',
        [booking.id],
      );
      if (!lockedRows[0] || lockedRows[0].status !== 'paid') {
        throw new HttpError(409, 'This booking changed status. Refresh the list and try again.');
      }
      const [usedRows] = await conn.execute(
        'SELECT COUNT(*) AS n FROM event_booking_checkins WHERE booking_id = ?',
        [booking.id],
      );
      if (Number(usedRows[0].n) > 0) {
        throw new HttpError(409, 'This pass has already been used at the gate, so it can no longer be changed.');
      }

      const [capacityRows] = await conn.execute(
        'SELECT capacity FROM event_schedule_capacities WHERE schedule_id = ? AND ticket_type_id = ? FOR UPDATE',
        [schedule.id, ticket.id],
      );
      if (!capacityRows[0]) throw new HttpError(409, 'This ticket is not open for the chosen city.');
      const [soldRows] = await conn.execute(
        `SELECT COALESCE(SUM(qty), 0) AS sold FROM event_bookings
         WHERE schedule_id = ? AND ticket_type_id = ?
           AND (status = 'paid' OR (status = 'pending' AND created_at > NOW() - INTERVAL 30 MINUTE))`,
        [schedule.id, ticket.id],
      );
      let left = Number(capacityRows[0].capacity) - Number(soldRows[0].sold);
      const sameSlot =
        Number(schedule.id) === Number(booking.schedule_id) &&
        Number(ticket.id) === Number(booking.ticket_type_id);
      if (sameSlot) left += Number(booking.qty);
      if (left < input.qty) {
        throw new HttpError(409, left > 0 ? `Only ${left} seat(s) left for that ticket.` : 'That ticket is sold out.');
      }

      const pricing = await effectiveUnitPrice(conn, ticket);
      const newGross = pricing.price * input.qty;
      const discount = Math.min(Number(booking.discount_amount || 0), newGross);
      const newAmount = newGross - discount;
      const oldAmount = Number(booking.amount);
      const delta = newAmount - oldAmount;

      if (delta > 0 && !input.paymentReference) {
        throw new HttpError(
          409,
          `The updated pass costs ₹${delta.toLocaleString('en-IN')} more. Collect the difference and enter its payment reference.`,
          { extraDue: delta, newAmount },
        );
      }

      const refund = Number(input.refundAmount ?? 0);
      const released = Math.max(0, -delta);
      if (delta >= 0 && refund > 0) {
        throw new HttpError(400, 'This change does not lower the fare, so there is nothing to refund.');
      }
      if (refund > released) {
        throw new HttpError(
          400,
          `The refund cannot exceed ₹${released.toLocaleString('en-IN')} released by this change.`,
        );
      }

      const scheduleDays = Math.max(1, Number(schedule.schedule_days) || 1);
      const passDays = Math.max(1, Math.min(Number(ticket.valid_days) || 1, scheduleDays));
      const qrToken = makeQrToken();

      await conn.execute(
        `UPDATE event_bookings
         SET schedule_id = ?, ticket_type_id = ?, qty = ?, pass_days = ?, unit_price = ?,
             gross_amount = ?, discount_amount = ?, amount = ?, qr_token = ?, pass_sent_at = NULL
         WHERE id = ?`,
        [
          schedule.id,
          ticket.id,
          input.qty,
          passDays,
          pricing.price,
          newGross,
          discount,
          newAmount,
          qrToken,
          booking.id,
        ],
      );

      await replaceAttendees(conn, booking.id, [
        { name: booking.name, phone: booking.phone, email: booking.email },
        ...input.attendees,
      ]);

      if (booking.coupon_code) {
        await conn.execute(
          'UPDATE event_coupon_uses SET amount_off = ? WHERE booking_id = ?',
          [discount, booking.id],
        );
      }

      if (delta < 0) {
        const removed = publicPass(booking).attendees.filter((person) => person.position > input.qty);
        await recordAdjustment(conn, {
          bookingId: booking.id,
          kind: 'fare_reduced',
          seatsRemoved: Math.max(0, Number(booking.qty) - input.qty),
          amountBefore: oldAmount,
          amountAfter: newAmount,
          refundAmount: refund,
          refundReference: input.refundReference,
          reason: input.reason,
          removedAttendees: removed,
          adminId: req.admin.id,
        });
        if (refund > 0) {
          await recordRefundOnPayment(conn, booking.id, {
            refundAmount: refund,
            refundReference: input.refundReference || null,
            adminId: req.admin.id,
          });
        }
      }

      if (delta > 0) {
        await conn.execute(
          `INSERT INTO event_payments (booking_id, provider, provider_ref, amount, status, raw)
           VALUES (?, 'admin', ?, ?, 'captured', ?)`,
          [
            booking.id,
            input.paymentReference || null,
            delta,
            JSON.stringify({
              kind: 'amendment',
              reason: input.reason,
              by: req.admin.id,
              fromScheduleId: Number(booking.schedule_id),
              toScheduleId: Number(schedule.id),
            }),
          ],
        );
      }

      return { pricing, newGross, discount, newAmount, delta, passDays, oldAmount, refund };
    });

    const updated = await loadBookingById(booking.id);
    const pass = publicPass(updated);
    const passFields = {
      reference: updated.reference,
      eventName: updated.event_name_en,
      ticketName: updated.ticket_name_en,
      venue: updated.venue_name_en,
      address: updated.address_en,
      city: updated.city_name_en,
      state: updated.state_name_en,
      dateLabel: updated.date_label_en,
      mapUrl: bookingMapUrl(updated),
      qty: Number(updated.qty),
      amount: Number(updated.amount),
      qrToken: updated.qr_token,
      passDays: pass.passDays,
      attendees: pass.attendees,
      bookingId: updated.id,
      note: 'Your booking was changed by the Adhyatmik Bharat team. This new QR replaces every earlier pass for this booking — please discard the old one.',
    };
    try {
      const delivery = await sendPassEmail({ to: updated.email, name: updated.name, ...passFields });
      for (const attendee of attendeeEmails(pass.attendees, updated.email)) {
        await sendPassEmail({ to: attendee.email, name: attendee.name, ...passFields });
      }
      if (delivery.delivered) {
        await query('UPDATE event_bookings SET pass_sent_at = NOW() WHERE id = ?', [updated.id]);
      }
    } catch (err) {
      console.error(`[amend-email] ${updated.reference}:`, err.message);
    }

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.amended',
      entity: 'event_booking',
      entityId: String(updated.id),
      meta: {
        reference: updated.reference,
        reason: input.reason,
        from: { scheduleId: Number(booking.schedule_id), ticketTypeId: Number(booking.ticket_type_id), qty: Number(booking.qty) },
        to: { scheduleId: Number(schedule.id), ticketTypeId: Number(ticket.id), qty: input.qty },
        oldAmount: outcome.oldAmount,
        newAmount: outcome.newAmount,
        delta: outcome.delta,
        paymentReference: input.paymentReference || null,
        refundAmount: outcome.refund,
        refundReference: input.refundReference || null,
      },
      ip: clientIp(req),
    });

    if (outcome.refund > 0) {
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'event.booking.refunded',
        entity: 'event_booking',
        entityId: String(updated.id),
        meta: {
          reference: updated.reference,
          refundAmount: outcome.refund,
          refundReference: input.refundReference || null,
          reason: input.reason,
        },
        ip: clientIp(req),
      });
    }

    res.json({
      pass,
      amount: outcome.newAmount,
      difference: outcome.delta,
      extraPaid: Math.max(0, outcome.delta),
      refundDue: Math.max(0, -outcome.delta),
      refundRecorded: outcome.refund,
    });
  }),
);

/* --------------------------- Cancellation & refunds --------------------------- */

const BOOKING_NOTICE_SELECT = `
  SELECT b.id, b.reference, b.name, b.email, b.status, b.amount, b.qty, b.pass_days, b.source,
         b.cancel_reason, b.refund_amount, b.refund_reference,
         e.name_en AS event_name, e.date_label_en,
         tt.name_en AS ticket_name, v.name_en AS venue_name, c.name_en AS city_name,
         (SELECT COUNT(*) FROM event_booking_checkins ci WHERE ci.booking_id = b.id) AS check_in_count
  FROM event_bookings b
  JOIN events e ON e.id = b.event_id
  JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
  JOIN event_schedules s ON s.id = b.schedule_id
  JOIN event_venues v ON v.id = s.venue_id
  JOIN event_cities c ON c.id = s.city_id
`;

async function loadBookingNotice(id) {
  const [row] = await query(`${BOOKING_NOTICE_SELECT} WHERE b.id = ? LIMIT 1`, [id]);
  return row ?? null;
}

async function sendCancellationNotice(row, { reason, refundAmount, refundReference, status }) {
  try {
    await sendBookingNoticeEmail({
      to: row.email,
      name: row.name,
      reference: row.reference,
      eventName: row.event_name,
      ticketName: row.ticket_name,
      venue: row.venue_name,
      city: row.city_name,
      dateLabel: row.date_label_en || '',
      qty: Number(row.qty),
      amount: Number(row.amount),
      status,
      reason,
      refundAmount: Number(refundAmount) || 0,
      refundReference: refundReference || null,
      bookingId: row.id,
    });
  } catch (err) {
    console.error(`[booking-notice] ${row.reference}:`, err.message);
  }
}

/** One row per money-moving change, so a re-priced or part-cancelled booking keeps its history. */
async function recordAdjustment(conn, {
  bookingId, kind, seatsRemoved, amountBefore, amountAfter, refundAmount,
  refundReference, reason, removedAttendees = [], adminId,
}) {
  await conn.execute(
    `INSERT INTO event_booking_adjustments
       (booking_id, kind, seats_removed, amount_before, amount_after, refund_amount,
        refund_reference, reason, removed_attendees, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bookingId,
      kind,
      seatsRemoved,
      amountBefore,
      amountAfter,
      refundAmount,
      refundReference || null,
      reason,
      removedAttendees.length ? JSON.stringify(removedAttendees) : null,
      adminId,
    ],
  );
}

/** Allocates a refund across captured payments (newest first) and keeps the trail in each payment's raw JSON. */
async function recordRefundOnPayment(conn, bookingId, { refundAmount, refundReference, adminId }) {
  const [payRows] = await conn.execute(
    `SELECT id, amount, raw FROM event_payments
     WHERE booking_id = ? AND status = 'captured' ORDER BY id DESC FOR UPDATE`,
    [bookingId],
  );
  let remaining = Number(refundAmount);
  for (const payment of payRows) {
    if (remaining <= 0) break;
    let raw = payment.raw;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = {};
      }
    }
    raw = raw && typeof raw === 'object' ? raw : {};
    const allocated = Math.min(remaining, Number(payment.amount));
    raw.refund = {
      ...(raw.refund || {}),
      amount: Number(raw.refund?.amount || 0) + allocated,
      reference: refundReference || null,
      at: new Date().toISOString(),
      by: adminId,
    };
    const fullyRefunded = Number(raw.refund.amount) >= Number(payment.amount);
    await conn.execute(
      'UPDATE event_payments SET status = ?, raw = ? WHERE id = ?',
      [fullyRefunded ? 'refunded' : 'captured', JSON.stringify(raw), payment.id],
    );
    remaining -= allocated;
  }
}

const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3).max(255),
  refundAmount: z.coerce.number().int().min(0).max(10000000).default(0),
  refundReference: z.string().trim().max(120).optional(),
});

adminRouter.post(
  '/bookings/:id/cancel',
  asyncHandler(async (req, res) => {
    const parsed = cancelBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Add a cancellation reason and a valid refund amount.', parsed.error.flatten().fieldErrors);
    }
    const { reason, refundAmount, refundReference } = parsed.data;

    const row = await loadBookingNotice(req.params.id);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (!['pending', 'paid'].includes(row.status)) {
      throw new HttpError(409, 'This booking is already cancelled or refunded.');
    }
    if (Number(row.check_in_count) > 0) {
      throw new HttpError(
        409,
        'This pass has already been scanned at the gate, so it cannot be cancelled. Block the pass instead if entry must stop.',
      );
    }
    if (row.status !== 'paid' && refundAmount > 0) {
      throw new HttpError(400, 'This booking has no captured payment, so there is nothing to refund.');
    }
    if (refundAmount > Number(row.amount)) {
      throw new HttpError(400, `The refund cannot exceed the paid amount of ₹${Number(row.amount).toLocaleString('en-IN')}.`);
    }

    const finalStatus = refundAmount > 0 ? 'refunded' : 'cancelled';
    const refundReferenceValue = refundReference ? refundReference : null;

    await withTransaction(async (conn) => {
      const [lockedRows] = await conn.execute('SELECT status FROM event_bookings WHERE id = ? FOR UPDATE', [row.id]);
      const locked = lockedRows[0];
      if (!locked || !['pending', 'paid'].includes(locked.status)) {
        throw new HttpError(409, 'This booking was closed by another admin. Refresh the list and try again.');
      }
      const [usedRows] = await conn.execute(
        'SELECT COUNT(*) AS n FROM event_booking_checkins WHERE booking_id = ?',
        [row.id],
      );
      if (Number(usedRows[0].n) > 0) {
        throw new HttpError(409, 'This pass has already been used at the gate, so it cannot be cancelled.');
      }

      await conn.execute(
        `UPDATE event_bookings
         SET status = ?, cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ?,
             refund_amount = ?, refund_reference = ?,
             refunded_at = ${refundAmount > 0 ? 'NOW()' : 'NULL'}, refunded_by = ?
         WHERE id = ?`,
        [
          finalStatus,
          req.admin.id,
          reason,
          refundAmount > 0 ? refundAmount : null,
          refundReferenceValue,
          refundAmount > 0 ? req.admin.id : null,
          row.id,
        ],
      );

      if (refundAmount > 0) {
        await recordRefundOnPayment(conn, row.id, {
          refundAmount,
          refundReference: refundReferenceValue,
          adminId: req.admin.id,
        });
      }
    });

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.cancelled',
      entity: 'event_booking',
      entityId: String(row.id),
      meta: {
        reference: row.reference,
        reason,
        previousStatus: row.status,
        refundAmount,
        refundReference: refundReferenceValue,
        refunded: refundAmount > 0,
      },
      ip: clientIp(req),
    });
    if (refundAmount > 0) {
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'event.booking.refunded',
        entity: 'event_booking',
        entityId: String(row.id),
        meta: { reference: row.reference, refundAmount, refundReference: refundReferenceValue },
        ip: clientIp(req),
      });
    }

    await sendCancellationNotice(row, {
      reason,
      refundAmount,
      refundReference: refundReferenceValue,
      status: finalStatus,
    });

    const updated = await loadBookingById(row.id);
    res.json({ pass: publicPass(updated), cancelled: true, refunded: refundAmount > 0 });
  }),
);

const refundBookingSchema = z.object({
  refundAmount: z.coerce.number().int().positive().max(10000000),
  refundReference: z.string().trim().max(120).optional(),
});

/** Records the money refund for a booking that was cancelled earlier without one. */
adminRouter.post(
  '/bookings/:id/refund',
  asyncHandler(async (req, res) => {
    const parsed = refundBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Enter the refund amount being returned.', parsed.error.flatten().fieldErrors);
    }
    const { refundAmount } = parsed.data;
    const refundReferenceValue = parsed.data.refundReference ? parsed.data.refundReference : null;

    const row = await loadBookingNotice(req.params.id);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (row.status === 'refunded') throw new HttpError(409, 'This booking already has a refund recorded.');
    if (row.status !== 'cancelled') {
      throw new HttpError(409, 'Cancel the booking first, then record the refund against it.');
    }
    if (Number(row.check_in_count) > 0) {
      throw new HttpError(409, 'This pass has already been used at the gate, so no refund can be recorded.');
    }
    if (Number(row.amount) <= 0) {
      throw new HttpError(400, 'This was a free pass — there is no payment to refund.');
    }
    if (refundAmount > Number(row.amount)) {
      throw new HttpError(400, `The refund cannot exceed the paid amount of ₹${Number(row.amount).toLocaleString('en-IN')}.`);
    }

    await withTransaction(async (conn) => {
      const [lockedRows] = await conn.execute('SELECT status FROM event_bookings WHERE id = ? FOR UPDATE', [row.id]);
      if (!lockedRows[0] || lockedRows[0].status !== 'cancelled') {
        throw new HttpError(409, 'This booking changed status. Refresh the list and try again.');
      }
      await conn.execute(
        `UPDATE event_bookings
         SET status = 'refunded', refund_amount = ?, refund_reference = ?, refunded_at = NOW(), refunded_by = ?
         WHERE id = ?`,
        [refundAmount, refundReferenceValue, req.admin.id, row.id],
      );
      await recordRefundOnPayment(conn, row.id, {
        refundAmount,
        refundReference: refundReferenceValue,
        adminId: req.admin.id,
      });
    });

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.refunded',
      entity: 'event_booking',
      entityId: String(row.id),
      meta: { reference: row.reference, refundAmount, refundReference: refundReferenceValue },
      ip: clientIp(req),
    });

    await sendCancellationNotice(row, {
      reason: row.cancel_reason,
      refundAmount,
      refundReference: refundReferenceValue,
      status: 'refunded',
    });

    const updated = await loadBookingById(row.id);
    res.json({ pass: publicPass(updated), refunded: true });
  }),
);

const cancelSeatsSchema = z.object({
  qty: z.coerce.number().int().min(1).max(19),
  reason: z.string().trim().min(3).max(255),
  refundAmount: z.coerce.number().int().min(0).max(10000000).default(0),
  refundReference: z.string().trim().max(120).optional(),
  positions: z.array(z.coerce.number().int().min(2)).max(19).optional(),
});

/**
 * Cancels part of a group pass: 4 seats out of 20. The rest of the pass stays valid, so this
 * releases only those seats and reissues the QR. The money released and any refund go into the
 * adjustment ledger — that is what the dashboard reads, not the rewritten booking amount.
 */
adminRouter.post(
  '/bookings/:id/cancel-seats',
  asyncHandler(async (req, res) => {
    const parsed = cancelSeatsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Choose the seats to cancel, a reason and any refund due.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const booking = await loadBookingById(req.params.id);
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'paid') throw new HttpError(409, 'Only a paid pass can have seats cancelled.');
    if (Number(booking.check_in_count) > 0) {
      throw new HttpError(409, 'This pass has already been scanned at the gate, so seats can no longer be removed.');
    }
    if (input.qty >= Number(booking.qty)) {
      throw new HttpError(400, 'Use the full cancellation action to cancel every seat on this pass.');
    }

    const outcome = await withTransaction(async (conn) => {
      const [lockedRows] = await conn.execute(
        `SELECT id, status, qty, amount, unit_price, discount_amount, coupon_code
         FROM event_bookings WHERE id = ? FOR UPDATE`,
        [booking.id],
      );
      const locked = lockedRows[0];
      if (!locked || locked.status !== 'paid') {
        throw new HttpError(409, 'This booking changed status. Refresh the list and try again.');
      }
      const [usedRows] = await conn.execute(
        'SELECT COUNT(*) AS n FROM event_booking_checkins WHERE booking_id = ?',
        [booking.id],
      );
      if (Number(usedRows[0].n) > 0) {
        throw new HttpError(409, 'This pass has already been used at the gate, so seats can no longer be removed.');
      }

      const oldQty = Number(locked.qty);
      const oldAmount = Number(locked.amount);
      const remainingQty = oldQty - input.qty;
      if (remainingQty < 1) {
        throw new HttpError(400, 'Use the full cancellation action to cancel every seat on this pass.');
      }

      const [people] = await conn.execute(
        `SELECT position, name, phone, email FROM event_booking_attendees
         WHERE booking_id = ? ORDER BY position`,
        [booking.id],
      );
      let removed;
      let kept;
      if (input.positions?.length) {
        const wanted = [...new Set(input.positions)];
        if (wanted.length !== input.qty) {
          throw new HttpError(400, `Pick exactly ${input.qty} attendee(s) to cancel.`);
        }
        const known = new Set(people.map((person) => Number(person.position)));
        if (wanted.some((position) => !known.has(position))) {
          throw new HttpError(400, 'One of those attendees is not on this booking.');
        }
        const drop = new Set(wanted);
        removed = people.filter((person) => drop.has(Number(person.position)));
        kept = people.filter((person) => !drop.has(Number(person.position)));
      } else {
        removed = people.filter((person) => Number(person.position) > 1).slice(-input.qty);
        const drop = new Set(removed.map((person) => Number(person.position)));
        kept = people.filter((person) => !drop.has(Number(person.position)));
      }
      if (people.length > 0 && removed.length !== input.qty) {
        throw new HttpError(400, 'Pick which named attendees are leaving — the booking has no spare unnamed seats.');
      }

      const newGross = Number(locked.unit_price) * remainingQty;
      const discount = Math.min(Number(locked.discount_amount || 0), newGross);
      const newAmount = newGross - discount;
      const released = Math.max(0, oldAmount - newAmount);
      const refund = Number(input.refundAmount || 0);
      if (refund > released) {
        throw new HttpError(
          400,
          `The refund cannot exceed ₹${released.toLocaleString('en-IN')} released by these seats.`,
        );
      }

      const qrToken = makeQrToken();
      await conn.execute(
        `UPDATE event_bookings
         SET qty = ?, gross_amount = ?, discount_amount = ?, amount = ?, qr_token = ?, pass_sent_at = NULL
         WHERE id = ?`,
        [remainingQty, newGross, discount, newAmount, qrToken, booking.id],
      );
      if (kept.length > 0) {
        await replaceAttendees(conn, booking.id, kept);
      }
      if (locked.coupon_code) {
        await conn.execute('UPDATE event_coupon_uses SET amount_off = ? WHERE booking_id = ?', [discount, booking.id]);
      }

      await recordAdjustment(conn, {
        bookingId: booking.id,
        kind: 'seats_cancelled',
        seatsRemoved: input.qty,
        amountBefore: oldAmount,
        amountAfter: newAmount,
        refundAmount: refund,
        refundReference: input.refundReference,
        reason: input.reason,
        removedAttendees: removed,
        adminId: req.admin.id,
      });
      if (refund > 0) {
        await recordRefundOnPayment(conn, booking.id, {
          refundAmount: refund,
          refundReference: input.refundReference || null,
          adminId: req.admin.id,
        });
      }

      return { oldQty, remainingQty, oldAmount, newAmount, released, refund, removed };
    });

    await audit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'event.booking.seats_cancelled',
      entity: 'event_booking',
      entityId: String(booking.id),
      meta: {
        reference: booking.reference,
        reason: input.reason,
        seatsCancelled: input.qty,
        seatsBefore: outcome.oldQty,
        seatsAfter: outcome.remainingQty,
        amountBefore: outcome.oldAmount,
        amountAfter: outcome.newAmount,
        refundAmount: outcome.refund,
        refundReference: input.refundReference || null,
        removed: outcome.removed.map((person) => person.name),
      },
      ip: clientIp(req),
    });
    if (outcome.refund > 0) {
      await audit({
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'event.booking.refunded',
        entity: 'event_booking',
        entityId: String(booking.id),
        meta: {
          reference: booking.reference,
          refundAmount: outcome.refund,
          refundReference: input.refundReference || null,
          reason: input.reason,
        },
        ip: clientIp(req),
      });
    }

    const updated = await loadBookingById(booking.id);
    const pass = publicPass(updated);
    const refundLine = outcome.refund > 0
      ? ` A refund of ₹${outcome.refund.toLocaleString('en-IN')} is being processed and should reach you within 15 working days.`
      : '';
    try {
      await sendPassEmail({
        to: updated.email,
        name: updated.name,
        reference: updated.reference,
        eventName: updated.event_name_en,
        ticketName: updated.ticket_name_en,
        venue: updated.venue_name_en,
        address: updated.address_en,
        city: updated.city_name_en,
        state: updated.state_name_en,
        dateLabel: updated.date_label_en,
        mapUrl: bookingMapUrl(updated),
        qty: Number(updated.qty),
        amount: Number(updated.amount),
        qrToken: updated.qr_token,
        passDays: pass.passDays,
        attendees: pass.attendees,
        bookingId: updated.id,
        note: `${outcome.removed.length || input.qty} seat(s) were cancelled by the Adhyatmik Bharat team at your request.${refundLine} This new QR replaces every earlier pass for this booking — please discard the old one.`,
      });
    } catch (err) {
      console.error(`[seats-cancelled-email] ${updated.reference}:`, err.message);
    }

    res.json({
      pass,
      seatsCancelled: input.qty,
      seatsLeft: outcome.remainingQty,
      amountBefore: outcome.oldAmount,
      amountAfter: outcome.newAmount,
      refundRecorded: outcome.refund,
    });
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
