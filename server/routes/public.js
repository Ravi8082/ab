import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { pingDatabase, pool, query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { HttpError, asyncHandler, makeQrToken, makeReference } from '../lib/util.js';
import { audit, clientIp } from '../lib/auth.js';
import { sendOtpEmail } from '../lib/mailer.js';
import {
  activateBooking,
  loadBookingByReference,
  publicPass,
  soldBySchedule,
} from '../lib/eventBookings.js';
import { getGateSettings, getSalesSettings, isSalesClosed, publicSalesState } from '../lib/settings.js';
import { brandImage, getBrand, publicBrand, resolveBrandFile } from '../lib/brand.js';
import { effectiveUnitPrice, priceOnDate, priceSlabsByTicket } from '../lib/ticketPricing.js';
import { joinWaitlist, resendWaitlistCode, verifyWaitlistCode } from '../lib/waitlist.js';
import { issuePassCode } from '../lib/passCodes.js';
import { cachedEventPage } from '../lib/pageCache.js';
import { normalizeCode, previewCoupon, recordCouponUse, redeemCoupon } from '../lib/offers.js';
import { replaceAttendees } from '../lib/attendees.js';

export const publicRouter = Router();

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts. Please try again later.' },
});

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lookups. Please wait a few minutes.' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code requests. Please wait.' },
});

// The pass screen refreshes its live QR once a minute; a little headroom for retries is enough.
const passCodeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many live QR requests. Please wait a minute.' },
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many payment attempts. Please wait a few minutes.' },
});

const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many coupon checks. Please wait a few minutes.' },
});

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many waitlist requests. Please wait a few minutes.' },
});

const waitlistVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many code attempts. Please wait a few minutes.' },
});

async function assertSalesOpen() {
  const settings = await getSalesSettings({ fresh: true });
  if (isSalesClosed(settings)) {
    throw new HttpError(503, settings.message_en || 'Online booking is temporarily paused.');
  }
  return settings;
}

const attendeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  email: z
    .string()
    .trim()
    .email()
    .max(190)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

const bookingSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  ticketTypeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  qty: z.coerce.number().int().min(1).max(20),
  acceptTerms: z.boolean().refine((value) => value === true, 'Accept the terms, privacy and refund policy to continue.'),
  couponCode: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => normalizeCode(value || ''))
    .refine((value) => value === '' || value.length >= 3, 'Enter a valid coupon code.'),
  attendees: z.array(attendeeSchema).max(19).optional(),
});

/** The buyer is attendee #1, so every extra seat needs its own person. */
function assertRoster(input) {
  const extra = input.qty - 1;
  const given = input.attendees?.length ?? 0;
  if (given !== extra) {
    throw new HttpError(400, 'Add the name and mobile number of every person in this booking.', {
      attendees: extra === 0 ? 'Remove the extra attendees.' : `Add ${extra} more attendee detail(s).`,
    });
  }
}

const waitlistSchema = z.object({
  stateId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit Indian mobile number'),
});

publicRouter.get(
  '/events/page',
  asyncHandler(async (_req, res) => {
    const payload = await cachedEventPage(async () => {
      const settings = await getSalesSettings();
      const now = new Date();
      const [
        contentRows, eventRows, ticketRows, stateRows, cityRows, venueRows,
        scheduleRows, capacityRows, slabsByTicket, sold, kindRows,
      ] =
        await Promise.all([
          query('SELECT content_key, value_json FROM event_content'),
          query('SELECT * FROM events WHERE active = 1 ORDER BY sort_order, id'),
          query('SELECT * FROM event_ticket_types WHERE active = 1 ORDER BY sort_order, id'),
          query('SELECT id, code, name_en, name_hi FROM event_states WHERE active = 1 ORDER BY sort_order, id'),
          query('SELECT id, state_id, name_en, name_hi FROM event_cities WHERE active = 1 ORDER BY sort_order, id'),
          query(
            `SELECT id, city_id, name_en, name_hi, address_en, address_hi, map_url
             FROM event_venues WHERE active = 1 ORDER BY sort_order, id`,
          ),
          query(
            `SELECT s.id, s.event_id, s.state_id, s.city_id, s.venue_id, s.event_date, s.end_date,
                    s.start_time, s.end_time, s.sale_ends_at, s.note_en, s.note_hi,
                    e.sale_ends_at AS event_sale_ends_at,
                    (COALESCE(s.sale_ends_at, e.sale_ends_at) IS NOT NULL
                      AND COALESCE(s.sale_ends_at, e.sale_ends_at) < NOW()) AS sale_ended,
                    (s.event_date < CURDATE()) AS date_passed
             FROM event_schedules s JOIN events e ON e.id = s.event_id
             WHERE s.active = 1 AND e.active = 1
             ORDER BY s.event_date, s.start_time, s.id`,
          ),
          query(
            `SELECT cap.schedule_id, cap.ticket_type_id, cap.capacity
             FROM event_schedule_capacities cap
             JOIN event_ticket_types tt ON tt.id = cap.ticket_type_id AND tt.active = 1`,
          ),
          priceSlabsByTicket(),
          soldBySchedule(),
          query('SELECT slug, label_en, label_hi, layout FROM event_kinds ORDER BY sort_order, slug'),
        ]);

      const ticketsByEvent = new Map();
      for (const ticket of ticketRows) {
        if (!ticketsByEvent.has(ticket.event_id)) ticketsByEvent.set(ticket.event_id, []);
        ticketsByEvent.get(ticket.event_id).push({
          ...ticket,
          inclusions: ticket.inclusions || [],
          ...priceOnDate(ticket, slabsByTicket.get(ticket.id) || [], now),
        });
      }

      const kindsBySlug = new Map(kindRows.map((kind) => [kind.slug, kind]));
      const events = eventRows.map((event) => {
        const kind = kindsBySlug.get(event.kind);
        return {
          ...event,
          kind_label: kind?.label_en ?? event.kind,
          kind_label_hi: kind?.label_hi ?? event.kind,
          // Older rows without a kind row still need a layout, or they would vanish from the page.
          kind_layout: kind?.layout ?? (event.kind === 'expo' ? 'single' : 'route'),
          tickets: ticketsByEvent.get(event.id) || [],
        };
      });

      const capacitiesBySchedule = new Map();
      for (const capacity of capacityRows) {
        if (!capacitiesBySchedule.has(capacity.schedule_id)) capacitiesBySchedule.set(capacity.schedule_id, []);
        const soldCount = sold.get(`${capacity.schedule_id}:${capacity.ticket_type_id}`) || 0;
        capacitiesBySchedule.get(capacity.schedule_id).push({
          ticketTypeId: capacity.ticket_type_id,
          capacity: Number(capacity.capacity),
          sold: soldCount,
          left: Math.max(0, Number(capacity.capacity) - soldCount),
        });
      }

      const schedules = scheduleRows.map((schedule) => ({
        ...schedule,
        sale_ended: Boolean(schedule.sale_ended),
        date_passed: Boolean(schedule.date_passed),
        capacities: capacitiesBySchedule.get(schedule.id) || [],
      }));

      const states = stateRows.map((state) => ({
        ...state,
        cities: cityRows
          .filter((city) => city.state_id === state.id)
          .map((city) => ({
            ...city,
            venues: venueRows.filter((venue) => venue.city_id === city.id),
          })),
      }));

      return {
        content: Object.fromEntries(contentRows.map((row) => [row.content_key, row.value_json])),
        events,
        states,
        schedules,
        paymentMode: config.paymentDevMode ? 'dev' : 'live',
        requireOtp: true,
        sales: publicSalesState(settings),
        serverNow: new Date().toISOString(),
      };
    });

    res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    res.json(payload);
  }),
);

publicRouter.get(
  '/events/cookie-banner',
  asyncHandler(async (_req, res) => {
    const rows = await query("SELECT value_json FROM event_content WHERE content_key = 'cookie_banner'");
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ banner: rows[0]?.value_json ?? null });
  }),
);

publicRouter.get(
  '/brand',
  asyncHandler(async (_req, res) => {
    const brand = await getBrand();
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.json({ brand: publicBrand(brand) });
  }),
);

publicRouter.get(
  '/brand/image/:field',
  asyncHandler(async (req, res) => {
    const brand = await getBrand();
    const image = brandImage(brand, req.params.field);
    const absolute = resolveBrandFile(image?.path);
    if (!absolute) throw new HttpError(404, 'No image uploaded for this yet.');

    // Uploaded bytes are named per upload, so a new image always arrives on a new URL.
    res.setHeader('Content-Type', image.mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(absolute)}"`);
    res.sendFile(absolute);
  }),
);

const LEGAL_PAGES = {
  terms: 'legal_terms',
  privacy: 'legal_privacy',
  refund: 'legal_refund',
};

publicRouter.get(
  '/events/legal/:page',
  asyncHandler(async (req, res) => {
    const key = LEGAL_PAGES[req.params.page];
    if (!key) throw new HttpError(404, 'That page does not exist.');

    const [rows, supportRows] = await Promise.all([
      query('SELECT value_json FROM event_content WHERE content_key = ?', [key]),
      query("SELECT value_json FROM event_content WHERE content_key = 'contact'"),
    ]);
    if (rows.length === 0) throw new HttpError(404, 'That page is not written yet.');

    res.set('Cache-Control', 'public, max-age=300');
    res.json({ page: req.params.page, content: rows[0].value_json, support: supportRows[0]?.value_json ?? null });
  }),
);

publicRouter.post(
  '/events/waitlist',
  waitlistLimiter,
  asyncHandler(async (req, res) => {
    const parsed = waitlistSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the details you entered.', parsed.error.flatten().fieldErrors);
    }

    const result = await joinWaitlist(parsed.data);
    await audit({
      actorType: 'public',
      action: result.alreadyVerified ? 'event.waitlist.repeated' : 'event.waitlist.joined',
      entity: 'event_state_waitlist',
      entityId: String(result.entry.id),
      meta: { stateId: result.state.id, ref: result.entry.ref, email: result.entry.email },
      ip: clientIp(req),
    });

    res.status(result.alreadyVerified ? 200 : 201).json({
      ref: result.entry.ref,
      state: { id: result.state.id, name_en: result.state.name_en, name_hi: result.state.name_hi },
      verified: result.alreadyVerified,
      nextStep: result.alreadyVerified ? 'done' : 'otp',
      delivered: result.alreadyVerified ? undefined : result.delivered,
    });
  }),
);

publicRouter.post(
  '/events/waitlist/:ref/otp',
  waitlistLimiter,
  asyncHandler(async (req, res) => {
    const result = await resendWaitlistCode(String(req.params.ref));
    res.json({
      ref: result.entry.ref,
      verified: result.alreadyVerified,
      nextStep: result.alreadyVerified ? 'done' : 'otp',
      delivered: result.alreadyVerified ? undefined : result.delivered,
    });
  }),
);

publicRouter.post(
  '/events/waitlist/:ref/verify',
  waitlistVerifyLimiter,
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code.');

    const result = await verifyWaitlistCode(String(req.params.ref), code);
    if (!result.already) {
      await audit({
        actorType: 'public',
        action: 'event.waitlist.verified',
        entity: 'event_state_waitlist',
        entityId: String(req.params.ref),
        ip: clientIp(req),
      });
    }
    res.json({ verified: true });
  }),
);

/** Read-only price preview so the drawer can show the discounted total before the booking exists. */
publicRouter.post(
  '/events/coupon/preview',
  couponLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        scheduleId: z.coerce.number().int().positive(),
        ticketTypeId: z.coerce.number().int().positive(),
        qty: z.coerce.number().int().min(1).max(20),
        email: z.string().trim().email().max(190).optional().transform((v) => (v ? v : undefined)),
        couponCode: z.string().trim().min(3).max(32).transform((v) => normalizeCode(v)),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the coupon details.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const [schedule] = await query(
      `SELECT s.id, s.event_id, s.active, e.active AS event_active
       FROM event_schedules s JOIN events e ON e.id = s.event_id WHERE s.id = ? LIMIT 1`,
      [input.scheduleId],
    );
    if (!schedule || !Number(schedule.active) || !Number(schedule.event_active)) {
      throw new HttpError(404, 'That event schedule is no longer available.');
    }
    const [ticket] = await query(
      'SELECT * FROM event_ticket_types WHERE id = ? AND event_id = ? AND active = 1 LIMIT 1',
      [input.ticketTypeId, schedule.event_id],
    );
    if (!ticket) throw new HttpError(400, 'Choose a valid ticket type.');

    const pricing = await effectiveUnitPrice(pool, ticket);
    const gross = pricing.price * input.qty;
    const result = await previewCoupon({
      code: input.couponCode,
      email: input.email ?? '',
      eventId: schedule.event_id,
      ticketTypeId: ticket.id,
      qty: input.qty,
      gross,
    });

    res.json({ ...result, grossAmount: gross, unitPrice: pricing.price });
  }),
);

publicRouter.post(
  '/events/bookings',
  bookingLimiter,
  asyncHandler(async (req, res) => {
    await assertSalesOpen();

    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Please check the details you entered.', parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    const [schedule] = await query(
      `SELECT s.*, e.kind, e.name_en AS event_name_en, e.name_hi AS event_name_hi,
              e.active AS event_active,
              DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1 AS schedule_days,
              (COALESCE(s.sale_ends_at, e.sale_ends_at) IS NOT NULL
                AND COALESCE(s.sale_ends_at, e.sale_ends_at) < NOW()) AS sale_ended
       FROM event_schedules s JOIN events e ON e.id = s.event_id
       WHERE s.id = ? LIMIT 1`,
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

    // Snapshot the purchased duration on the pass, capped to the days this schedule actually runs.
    const scheduleDays = Math.max(1, Number(schedule.schedule_days) || 1);
    const passDays = Math.max(1, Math.min(Number(ticket.valid_days) || 1, scheduleDays));

    const [capacity] = await query(
      'SELECT capacity FROM event_schedule_capacities WHERE schedule_id = ? AND ticket_type_id = ? LIMIT 1',
      [schedule.id, ticket.id],
    );
    if (!capacity) throw new HttpError(409, 'This ticket is not open for this city.');

    assertRoster(input);

    async function insertBooking(reference) {
      return withTransaction(async (conn) => {
        const [capRows] = await conn.execute(
          'SELECT capacity FROM event_schedule_capacities WHERE schedule_id = ? AND ticket_type_id = ? FOR UPDATE',
          [schedule.id, ticket.id],
        );
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

        // Re-price at the server's current date slab so a stale page cannot buy at an old rate.
        const pricing = await effectiveUnitPrice(conn, ticket);
        const unitPrice = pricing.price;
        const gross = unitPrice * input.qty;
        const coupon = input.couponCode
          ? await redeemCoupon(conn, {
              code: input.couponCode,
              email: input.email,
              eventId: schedule.event_id,
              ticketTypeId: ticket.id,
              qty: input.qty,
              gross,
            })
          : null;
        const discount = coupon?.amountOff ?? 0;
        const amount = gross - discount;

        const [result] = await conn.execute(
          `INSERT INTO event_bookings
            (reference, event_id, schedule_id, ticket_type_id, name, email, phone, qty, pass_days, unit_price, amount,
             gross_amount, discount_amount, coupon_code, source, guest_category, terms_accepted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', 'visitor', NOW())`,
          [
            reference, schedule.event_id, schedule.id, ticket.id,
            input.name, input.email.toLowerCase(), input.phone, input.qty, passDays, unitPrice, amount,
            gross, discount, coupon?.code ?? null,
          ],
        );
        const bookingId = result.insertId;
        await conn.execute(
          `INSERT INTO event_payments (booking_id, provider, amount, status) VALUES (?, 'dev', ?, 'created')`,
          [bookingId, amount],
        );
        if (coupon) {
          await recordCouponUse(conn, {
            couponId: coupon.couponId,
            bookingId,
            email: input.email,
            amountOff: discount,
          });
        }
        await replaceAttendees(conn, bookingId, [
          { name: input.name, phone: input.phone, email: input.email },
          ...(input.attendees ?? []),
        ]);
        return { bookingId, amount, gross, discount, coupon, unitPrice, pricing };
      });
    }

    let inserted = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      const reference = makeReference();
      try {
        inserted = { reference, ...(await insertBooking(reference)) };
      } catch (err) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (!inserted) throw new HttpError(500, 'Could not create the booking. Please retry.');

    const [booking] = await query(
      'SELECT reference, amount, status FROM event_bookings WHERE id = ?',
      [inserted.bookingId],
    );
    await audit({
      actorType: 'public',
      action: 'event.booking.created',
      entity: 'event_booking',
      entityId: String(inserted.bookingId),
      meta: {
        scheduleId: schedule.id,
        ticketTypeId: ticket.id,
        qty: input.qty,
        amount: inserted.amount,
        discount: inserted.discount,
        couponCode: inserted.coupon?.code ?? null,
      },
      ip: clientIp(req),
    });

    res.status(201).json({
      reference: booking.reference,
      amount: Number(booking.amount),
      unitPrice: inserted.unitPrice,
      pricing: inserted.pricing,
      grossAmount: inserted.gross,
      discount: inserted.discount,
      couponCode: inserted.coupon?.code ?? null,
      couponLabel: inserted.coupon ? { en: inserted.coupon.label_en, hi: inserted.coupon.label_hi } : null,
      qty: input.qty,
      attendees: (input.attendees ?? []).length + 1,
      passDays,
      nextStep: 'otp',
      saleEndsAt: schedule.sale_ends_at || null,
      eventName: { en: schedule.event_name_en, hi: schedule.event_name_hi },
      ticketName: { en: ticket.name_en, hi: ticket.name_hi },
    });
  }),
);

publicRouter.post(
  '/events/bookings/:reference/otp',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const [booking] = await query(
      'SELECT id, reference, email, status FROM event_bookings WHERE reference = ? LIMIT 1',
      [req.params.reference],
    );
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'pending') throw new HttpError(409, 'This booking is already closed.');

    const [recent] = await query(
      'SELECT id FROM event_booking_otps WHERE booking_id = ? AND created_at > NOW() - INTERVAL 45 SECOND LIMIT 1',
      [booking.id],
    );
    if (recent) throw new HttpError(429, 'Please wait a moment before asking for another code.');

    const code = String(crypto.randomInt(100000, 1000000));
    const hash = await bcrypt.hash(code, 10);
    await query(
      `INSERT INTO event_booking_otps (booking_id, code_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [booking.id, hash],
    );
    const sent = await sendOtpEmail({
      to: booking.email,
      code,
      purpose: 'booking',
      bookingId: booking.id,
      reference: booking.reference,
    });

    res.json({
      sent: sent.delivered,
    });
  }),
);

publicRouter.post(
  '/events/bookings/:reference/verify-otp',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code.');

    const [booking] = await query(
      'SELECT id, status FROM event_bookings WHERE reference = ? LIMIT 1',
      [req.params.reference],
    );
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'pending') throw new HttpError(409, 'This booking is already closed.');

    const [row] = await query(
      `SELECT id, code_hash, attempts FROM event_booking_otps
       WHERE booking_id = ? AND consumed_at IS NULL AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [booking.id],
    );
    if (!row) throw new HttpError(400, 'That code has expired. Request a new one.');
    if (Number(row.attempts) >= 5) throw new HttpError(429, 'Too many wrong attempts. Request a new code.');

    const ok = await bcrypt.compare(code, row.code_hash);
    if (!ok) {
      await query('UPDATE event_booking_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      throw new HttpError(400, 'Incorrect code.');
    }

    await withTransaction(async (conn) => {
      await conn.execute('UPDATE event_booking_otps SET consumed_at = NOW() WHERE id = ?', [row.id]);
      await conn.execute('UPDATE event_bookings SET otp_verified_at = NOW() WHERE id = ?', [booking.id]);
    });

    res.json({ verified: true });
  }),
);

publicRouter.post(
  '/events/bookings/:reference/order',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    await assertSalesOpen();

    const [booking] = await query(
      `SELECT b.id, b.reference, b.amount, b.qty, b.status, b.otp_verified_at, b.email, b.phone, b.name,
              e.name_en AS event_name, tt.name_en AS ticket_name
       FROM event_bookings b
       JOIN events e ON e.id = b.event_id
       JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
       WHERE b.reference = ? LIMIT 1`,
      [req.params.reference],
    );
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status !== 'pending') throw new HttpError(409, 'This booking is already paid or closed.');
    if (!booking.otp_verified_at) throw new HttpError(403, 'Verify your email code before paying.');

    // A full discount leaves nothing to charge, so the pass is issued straight away.
    if (Number(booking.amount) === 0) {
      const pass = await activateBooking({ bookingId: booking.id, provider: 'dev', ip: clientIp(req) });
      return res.json({ mode: 'free', reference: booking.reference, pass });
    }

    if (config.paymentDevMode) return res.json({ mode: 'dev' });

    const { keyId, keySecret } = config.razorpay;
    if (!keyId || !keySecret) {
      throw new HttpError(503, 'Online payment is not configured yet. Please contact the help desk.');
    }

    // Reuse a recent order so double-clicks do not create duplicate Razorpay orders.
    const [recentOrder] = await query(
      `SELECT provider_ref FROM event_payments
       WHERE booking_id = ? AND provider = 'razorpay' AND status = 'created'
         AND provider_ref IS NOT NULL AND created_at > NOW() - INTERVAL 20 MINUTE
       ORDER BY id DESC LIMIT 1`,
      [booking.id],
    );
    if (recentOrder?.provider_ref) {
      return res.json({
        mode: 'razorpay',
        keyId,
        orderId: recentOrder.provider_ref,
        amount: Number(booking.amount) * 100,
        currency: 'INR',
        name: 'Adhyatmik Bharat',
        description: `${booking.event_name} · ${booking.ticket_name} × ${booking.qty}`,
        prefill: { name: booking.name, email: booking.email, contact: booking.phone },
        notes: { reference: booking.reference },
      });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Number(booking.amount) * 100,
        currency: 'INR',
        receipt: booking.reference,
        notes: {
          reference: booking.reference,
          booking_id: String(booking.id),
          event: booking.event_name,
        },
      }),
    });
    const order = await response.json().catch(() => ({}));
    if (!response.ok || !order.id) {
      console.error('[razorpay] order failed', order);
      throw new HttpError(502, 'Could not start the payment. Please retry or contact the help desk.');
    }

    await query(
      `UPDATE event_payments
       SET provider = 'razorpay', provider_ref = ?, status = 'created'
       WHERE booking_id = ? ORDER BY id DESC LIMIT 1`,
      [order.id, booking.id],
    );

    res.json({
      mode: 'razorpay',
      keyId,
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency || 'INR',
      name: 'Adhyatmik Bharat',
      description: `${booking.event_name} · ${booking.ticket_name} × ${booking.qty}`,
      prefill: { name: booking.name, email: booking.email, contact: booking.phone },
      notes: { reference: booking.reference },
    });
  }),
);

publicRouter.post(
  '/events/bookings/:reference/pay',
  paymentLimiter,
  asyncHandler(async (req, res) => {
    await assertSalesOpen();

    if (!config.paymentDevMode) {
      throw new HttpError(409, 'Use the Razorpay checkout to complete this payment.');
    }

    const [booking] = await query(
      'SELECT id, reference, status, otp_verified_at FROM event_bookings WHERE reference = ? LIMIT 1',
      [req.params.reference],
    );
    if (!booking) throw new HttpError(404, 'Booking not found.');
    if (booking.status === 'paid') {
      const pass = await loadBookingByReference(booking.reference);
      return res.json({ mode: 'dev', status: 'paid', pass: publicPass(pass) });
    }
    if (booking.status !== 'pending') throw new HttpError(409, 'This booking can no longer be paid.');
    if (!booking.otp_verified_at) throw new HttpError(403, 'Verify your email code before paying.');

    const pass = await activateBooking({
      bookingId: booking.id,
      provider: 'dev',
      providerRef: `DEV-${booking.reference}`,
      raw: { mode: 'simulated', qr: makeQrToken().slice(0, 8) },
      ip: clientIp(req),
    });

    res.json({ mode: 'dev', status: 'paid', pass });
  }),
);

publicRouter.get(
  '/events/bookings/:reference',
  lookupLimiter,
  asyncHandler(async (req, res) => {
    const contact = String(req.query.contact || '').trim().toLowerCase();
    if (!contact) throw new HttpError(400, 'Enter the email or phone used for the booking.');

    const row = await loadBookingByReference(req.params.reference);
    if (!row) throw new HttpError(404, 'Booking not found.');
    if (row.email !== contact && row.phone !== contact.replace(/\D/g, '')) {
      throw new HttpError(403, 'These details do not match this booking.');
    }

    res.json(publicPass(row));
  }),
);

publicRouter.get(
  '/events/gate-settings',
  asyncHandler(async (_req, res) => {
    const settings = await getGateSettings();
    res.json({ liveQrOnly: settings.live_qr_only });
  }),
);

publicRouter.post(
  '/events/pass-code',
  passCodeLimiter,
  asyncHandler(async (req, res) => {
    const issued = await issuePassCode({
      reference: req.body?.reference,
      contact: req.body?.contact,
      ip: clientIp(req),
    });
    res.json(issued);
  }),
);

function webhookEvent(payload) {
  const eventType = String(payload?.event || '');
  if (eventType === 'payment.captured') {
    return { eventType, kind: 'payment', entity: payload.payload?.payment?.entity || {} };
  }
  if (eventType === 'order.paid') {
    return { eventType, kind: 'order', entity: payload.payload?.order?.entity || {} };
  }
  return null;
}

async function setWebhookOutcome(id, outcome, bookingId = null) {
  if (!id) return;
  await query(
    'UPDATE payment_webhook_events SET outcome = ?, booking_id = COALESCE(?, booking_id) WHERE id = ?',
    [outcome, bookingId, id],
  );
}

export async function razorpayWebhookHandler(req, res) {
  let webhookRowId = null;
  try {
    const secret = config.razorpay.webhookSecret;
    if (!secret) {
      return res.status(503).json({ error: 'Webhook secret is not configured.' });
    }
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const digest = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
    const valid =
      signature.length === digest.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    if (!valid) return res.status(400).json({ error: 'Invalid webhook signature.' });

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid webhook body.' });
    }

    const parsed = webhookEvent(payload);
    if (!parsed) return res.json({ ok: true, ignored: payload?.event || 'unknown' });

    const eventId = String(
      payload.event_id ||
        req.headers['x-razorpay-event-id'] ||
        crypto.createHash('sha256').update(req.body).digest('hex').slice(0, 64),
    );
    const entity = parsed.entity || {};
    const orderId = parsed.kind === 'payment' ? String(entity.order_id || '') : String(entity.id || '');
    const amountPaise = Number(entity.amount);
    const currency = String(entity.currency || 'INR').toUpperCase();

    try {
      const inserted = await query(
        `INSERT INTO payment_webhook_events (provider, event_id, event_type, amount, outcome)
         VALUES ('razorpay', ?, ?, ?, 'received')`,
        [eventId, parsed.eventType, Number.isFinite(amountPaise) ? Math.round(amountPaise / 100) : null],
      );
      webhookRowId = inserted.insertId;
    } catch (err) {
      if (err?.code !== 'ER_DUP_ENTRY') throw err;
      const [existing] = await query(
        `SELECT id, outcome FROM payment_webhook_events WHERE provider = 'razorpay' AND event_id = ? LIMIT 1`,
        [eventId],
      );
      if (!existing) return res.json({ ok: true, duplicate: true });
      if (!['received', 'error'].includes(existing.outcome)) {
        return res.json({ ok: true, duplicate: true, outcome: existing.outcome });
      }
      webhookRowId = existing.id;
      await query(`UPDATE payment_webhook_events SET outcome = 'received' WHERE id = ?`, [existing.id]);
    }

    if (!orderId) {
      await setWebhookOutcome(webhookRowId, 'ignored_missing_order');
      return res.json({ ok: true, ignored: 'missing-order' });
    }

    const [payment] = await query(
      `SELECT p.booking_id, b.amount
       FROM event_payments p JOIN event_bookings b ON b.id = p.booking_id
       WHERE p.provider = 'razorpay' AND p.provider_ref = ?
       LIMIT 1`,
      [orderId],
    );
    if (!payment) {
      await setWebhookOutcome(webhookRowId, 'ignored_unknown_order');
      console.error('[razorpay] webhook order is not linked to a booking', { orderId, eventId });
      return res.json({ ok: true, ignored: 'order-not-found' });
    }

    const bookingId = Number(payment.booking_id);
    const expectedPaise = Number(payment.amount) * 100;
    if (!Number.isFinite(amountPaise) || amountPaise !== expectedPaise || currency !== 'INR') {
      await setWebhookOutcome(webhookRowId, 'rejected_amount', bookingId);
      console.error(
        `[razorpay] amount mismatch for ${eventId}: received ${amountPaise} ${currency}, expected ${expectedPaise} INR`,
      );
      await audit({
        actorType: 'system',
        action: 'event.payment.rejected',
        entity: 'event_booking',
        entityId: String(bookingId),
        meta: { eventId, orderId, received: amountPaise, expected: expectedPaise, currency },
        ip: clientIp(req),
      });
      return res.json({ ok: true, ignored: 'amount-mismatch' });
    }

    const expectedStatus = parsed.kind === 'payment' ? 'captured' : 'paid';
    if (String(entity.status || '').toLowerCase() !== expectedStatus) {
      await setWebhookOutcome(webhookRowId, 'ignored_status', bookingId);
      return res.json({ ok: true, ignored: 'status' });
    }

    try {
      await activateBooking({
        bookingId,
        provider: 'razorpay',
        providerRef: orderId,
        raw: entity,
        ip: clientIp(req),
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        await setWebhookOutcome(webhookRowId, 'ignored_booking_status', bookingId);
        return res.json({ ok: true, ignored: 'booking-status' });
      }
      throw err;
    }

    await setWebhookOutcome(webhookRowId, 'captured', bookingId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[razorpay] webhook error', err);
    try {
      await setWebhookOutcome(webhookRowId, 'error');
    } catch {
      // The original failure is already logged.
    }
    res.status(500).json({ ok: false });
  }
}

publicRouter.get('/health', async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ ok: true, service: 'adhyatmik-bharat-api', database: 'up' });
  } catch (err) {
    res.status(503).json({ ok: false, service: 'adhyatmik-bharat-api', database: 'down' });
  }
});
