import { pool } from '../db.js';
import { config } from '../config.js';
import { loadBookingById, bookingMapUrl } from './eventBookings.js';
import { sendReminderEmail } from './mailer.js';
import { getSalesSettings } from './settings.js';

const LOCK_NAME = 'ab_reminders_v1';
const BATCH_SIZE = 40;
const MAX_ATTEMPTS = 3;

function formatTime(value) {
  if (!value) return '';
  const [hourRaw, minute = '00'] = String(value).split(':');
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return '';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

function dateLabel(row) {
  const base = row.date_label_en || row.event_date || '';
  const time = formatTime(row.start_time);
  return time ? `${base} · ${time}` : base;
}

async function markSkipped(conn, id, message) {
  await conn.execute(
    `UPDATE email_reminders SET status = 'skipped', last_error = ? WHERE id = ?`,
    [message.slice(0, 255), id],
  );
}

async function markFailed(conn, reminder, err) {
  const attempts = Number(reminder.attempts) + 1;
  const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  await conn.execute(
    `UPDATE email_reminders SET status = ?, attempts = ?, last_error = ? WHERE id = ?`,
    [status, attempts, String(err?.message || 'send failed').slice(0, 255), reminder.id],
  );
}

/**
 * Enqueues due reminders and sends one batch. A MySQL advisory lock keeps multiple
 * app instances from processing the same rows at the same time.
 */
export async function runReminderSweep() {
  const settings = await getSalesSettings({ fresh: true });
  if (!settings.reminders_enabled) {
    return { skipped: true, reason: 'reminders-disabled', enqueued: 0, sent: 0, failed: 0, errors: 0 };
  }

  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_NAME]);
    if (!Number(lock?.acquired)) {
      return { skipped: true, reason: 'already-running', enqueued: 0, sent: 0, failed: 0, errors: 0 };
    }

    try {
      const [pending] = await conn.query(
        `INSERT IGNORE INTO email_reminders (booking_id, reminder_type)
         SELECT b.id, 'payment_pending'
         FROM event_bookings b
         JOIN event_schedules s ON s.id = b.schedule_id AND s.active = 1
         JOIN events e ON e.id = b.event_id AND e.active = 1
         WHERE b.status = 'pending'
           AND b.created_at BETWEEN NOW() - INTERVAL 40 MINUTE AND NOW() - INTERVAL 25 MINUTE
           AND (COALESCE(s.sale_ends_at, e.sale_ends_at) IS NULL
                OR COALESCE(s.sale_ends_at, e.sale_ends_at) > NOW())`,
      );

      const [dayBefore] = await conn.query(
        `INSERT IGNORE INTO email_reminders (booking_id, reminder_type)
         SELECT b.id, 'event_24h'
         FROM event_bookings b
         JOIN event_schedules s ON s.id = b.schedule_id AND s.active = 1
         WHERE b.status = 'paid'
           AND TIMESTAMPDIFF(
             MINUTE, NOW(), TIMESTAMP(s.event_date, COALESCE(s.start_time, '09:00:00'))
           ) BETWEEN 1380 AND 1440`,
      );

      const [twoHours] = await conn.query(
        `INSERT IGNORE INTO email_reminders (booking_id, reminder_type)
         SELECT b.id, 'event_2h'
         FROM event_bookings b
         JOIN event_schedules s ON s.id = b.schedule_id AND s.active = 1
         WHERE b.status = 'paid'
           AND TIMESTAMPDIFF(
             MINUTE, NOW(), TIMESTAMP(s.event_date, COALESCE(s.start_time, '09:00:00'))
           ) BETWEEN 60 AND 120`,
      );

      const [rows] = await conn.query(
        `SELECT r.id, r.booking_id, r.reminder_type, r.attempts
         FROM email_reminders r
         WHERE r.status IN ('pending', 'failed') AND r.attempts < ?
         ORDER BY r.id LIMIT ?`,
        [MAX_ATTEMPTS, BATCH_SIZE],
      );

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const reminder of rows) {
        if (reminder.reminder_type === 'payment_pending') {
          const [bookingRows] = await conn.execute(
            'SELECT status FROM event_bookings WHERE id = ? LIMIT 1',
            [reminder.booking_id],
          );
          if (bookingRows[0]?.status !== 'pending') {
            await markSkipped(conn, reminder.id, 'Booking is no longer pending.');
            skipped += 1;
            continue;
          }
        }

        const booking = await loadBookingById(reminder.booking_id);
        if (!booking) {
          await markSkipped(conn, reminder.id, 'Booking not found.');
          skipped += 1;
          continue;
        }
        if (reminder.reminder_type === 'payment_pending' && booking.status !== 'pending') {
          await markSkipped(conn, reminder.id, 'Booking is no longer pending.');
          skipped += 1;
          continue;
        }
        if (reminder.reminder_type !== 'payment_pending' && booking.status !== 'paid') {
          await markSkipped(conn, reminder.id, 'Booking is not paid.');
          skipped += 1;
          continue;
        }

        try {
          const result = await sendReminderEmail({
            to: booking.email,
            name: booking.name,
            reference: booking.reference,
            eventName: booking.event_name_en,
            ticketName: booking.ticket_name_en,
            venue: booking.venue_name_en,
            address: booking.address_en,
            city: booking.city_name_en,
            state: booking.state_name_en,
            dateLabel: dateLabel(booking),
            mapUrl: bookingMapUrl(booking),
            qty: Number(booking.qty),
            amount: Number(booking.amount),
            qrToken: booking.qr_token,
            reminderType: reminder.reminder_type,
            bookingId: reminder.booking_id,
          });

          if (result.delivered) {
            await conn.execute(
              `UPDATE email_reminders SET status = 'sent', sent_at = NOW(), last_error = NULL WHERE id = ?`,
              [reminder.id],
            );
            sent += 1;
          } else {
            await markSkipped(conn, reminder.id, 'SMTP is not configured.');
            skipped += 1;
          }
        } catch (err) {
          await markFailed(conn, reminder, err);
          failed += 1;
        }
      }

      return {
        skipped: false,
        enqueued:
          Number(pending.affectedRows || 0) +
          Number(dayBefore.affectedRows || 0) +
          Number(twoHours.affectedRows || 0),
        sent,
        skippedCount: skipped,
        failed,
        processed: rows.length,
      };
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    conn.release();
  }
}

export function startReminderScheduler() {
  if (!config.reminders.enabled) {
    console.log('[reminders] disabled by REMINDERS_ENABLED=false');
    return () => {};
  }

  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const result = await runReminderSweep();
      if (!result.skipped && (result.enqueued || result.processed)) {
        console.log(
          `[reminders] enqueued ${result.enqueued}, sent ${result.sent}, skipped ${result.skippedCount}, failed ${result.failed}`,
        );
      }
    } catch (err) {
      console.error('[reminders] sweep failed:', err.message);
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void tick(), 20_000);
  first.unref?.();
  const timer = setInterval(() => void tick(), config.reminders.intervalMs);
  timer.unref?.();

  console.log(`[reminders] scheduler every ${Math.round(config.reminders.intervalMs / 1000)}s`);

  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
  };
}
