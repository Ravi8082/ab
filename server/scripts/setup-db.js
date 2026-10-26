import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { INDIAN_STATES } from '../lib/indianStates.js';
import { DEFAULT_EVENT_KINDS } from '../lib/eventKinds.js';
import { LEGAL_CONTENT } from './legal-content.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const COOKIE_BANNER = {
  title: { en: 'Your cookie choice', hi: 'कुकीज़ की आपकी पसंद' },
  body: {
    en: 'Strictly necessary cookies (sign-in, QR verification) always run. Optional analytics load only if you accept.',
    hi: 'साइन-इन और QR जाँच के लिए केवल आवश्यक कुकीज़ हमेशा चलती हैं। वैकल्पिक एनालिटिक्स केवल आपकी स्वीकृति के बाद।',
  },
  necessary: { en: 'Necessary only', hi: 'केवल आवश्यक' },
  accept: { en: 'Accept all', hi: 'सभी स्वीकार करें' },
  privacy: { en: 'Privacy policy', hi: 'गोपनीयता नीति' },
};

async function main() {
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.query(`USE \`${config.db.database}\``);

  const schema = await fs.readFile(path.join(here, '..', 'schema.sql'), 'utf8');
  await root.query(schema);

  async function ensureIndex(table, index, definition) {
    const [rows] = await root.query(
      `SELECT 1 FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [config.db.database, table, index],
    );
    if (rows.length === 0) await root.query(`ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${definition})`);
  }

  async function hasColumn(table, column) {
    const [rows] = await root.query(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
      [config.db.database, table, column],
    );
    return rows.length > 0;
  }

  async function ensureColumn(table, column, definition) {
    if (await hasColumn(table, column)) return false;
    await root.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    return true;
  }

  async function ensureConstraint(table, name, definition) {
    const [rows] = await root.query(
      `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
      [config.db.database, table, name],
    );
    if (rows.length === 0) await root.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` ${definition}`);
  }

  await ensureIndex('event_schedules', 'idx_schedule_date', 'event_date');
  await ensureIndex('event_bookings', 'idx_event_booking_status_created', 'status, created_at');
  await ensureIndex('event_bookings', 'idx_event_booking_sold', 'schedule_id, ticket_type_id, status');
  await ensureIndex('event_payments', 'idx_epay_provider_ref', 'provider, provider_ref');

  if (await ensureColumn('event_ticket_types', 'valid_days', 'INT NOT NULL DEFAULT 1 AFTER default_capacity')) {
    await root.query(
      `UPDATE event_ticket_types tt JOIN events e ON e.id = tt.event_id
       SET tt.valid_days = IF(e.kind = 'expo', 3, 1)`,
    );
  }

  if (await ensureColumn('event_bookings', 'pass_days', 'INT NOT NULL DEFAULT 1 AFTER qty')) {
    await root.query(
      `UPDATE event_bookings b
       JOIN event_ticket_types tt ON tt.id = b.ticket_type_id
       JOIN event_schedules s ON s.id = b.schedule_id
       SET b.pass_days = GREATEST(1, LEAST(tt.valid_days, DATEDIFF(COALESCE(s.end_date, s.event_date), s.event_date) + 1))`,
    );
  }

  await ensureColumn('event_bookings', 'terms_accepted_at', 'DATETIME NULL AFTER otp_verified_at');

  // Admin-issued free passes, coupons, guest category and per-person attendee details.
  await ensureColumn('event_bookings', 'source', "ENUM('online','admin_free','admin_issued') NOT NULL DEFAULT 'online' AFTER status");
  await ensureColumn('event_bookings', 'guest_category', "ENUM('visitor','vip','press','organiser','staff','other') NOT NULL DEFAULT 'visitor' AFTER source");
  await ensureColumn('event_bookings', 'coupon_code', 'VARCHAR(32) NULL AFTER guest_category');
  await ensureColumn('event_bookings', 'discount_amount', 'INT NOT NULL DEFAULT 0 AFTER coupon_code');
  await ensureColumn('event_bookings', 'gross_amount', 'INT NULL AFTER discount_amount');
  await ensureColumn('event_bookings', 'issued_by', 'INT NULL AFTER gross_amount');
  await ensureColumn('event_bookings', 'admin_note', 'VARCHAR(255) NULL AFTER issued_by');
  await ensureIndex('event_bookings', 'idx_event_booking_coupon', 'coupon_code');
  await ensureConstraint('event_bookings', 'fk_eb_issuer', 'FOREIGN KEY (issued_by) REFERENCES admins(id) ON DELETE SET NULL');

  // Cancellation and refund trail, so the 15-day refund promise has an actual record.
  await ensureColumn('event_bookings', 'cancelled_at', 'DATETIME NULL AFTER checked_in_by');
  await ensureColumn('event_bookings', 'cancelled_by', 'INT NULL AFTER cancelled_at');
  await ensureColumn('event_bookings', 'cancel_reason', 'VARCHAR(255) NULL AFTER cancelled_by');
  await ensureColumn('event_bookings', 'refund_amount', 'INT NULL AFTER cancel_reason');
  await ensureColumn('event_bookings', 'refund_reference', 'VARCHAR(120) NULL AFTER refund_amount');
  await ensureColumn('event_bookings', 'refunded_at', 'DATETIME NULL AFTER refund_reference');
  await ensureColumn('event_bookings', 'refunded_by', 'INT NULL AFTER refunded_at');
  await ensureConstraint('event_bookings', 'fk_eb_canceller', 'FOREIGN KEY (cancelled_by) REFERENCES admins(id) ON DELETE SET NULL');
  await ensureConstraint('event_bookings', 'fk_eb_refunder', 'FOREIGN KEY (refunded_by) REFERENCES admins(id) ON DELETE SET NULL');

  // Booking-update emails (cancellation / refund notices) reuse the email log.
  const [emailKind] = await root.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_log' AND COLUMN_NAME = 'kind'`,
    [config.db.database],
  );
  if (emailKind[0] && !String(emailKind[0].COLUMN_TYPE).includes("'notice'")) {
    await root.query(
      `ALTER TABLE email_log MODIFY COLUMN kind ENUM('otp','pass','reminder','test','notice') NOT NULL`,
    );
    console.log('Email log now records booking notices (cancellation / refund).');
  }

  // Which physical gate took the entry, so a QR forwarded to another gate is visible.
  await ensureColumn('event_booking_checkins', 'gate', 'VARCHAR(60) NULL AFTER checked_in_by');
  await ensureColumn('event_scan_denials', 'other_gate', "TINYINT(1) NOT NULL DEFAULT 0 AFTER gate");

  // A ticked name at the gate is stored on its own row, so a 20-seat booking can show
  // exactly who has walked in today.
  await ensureColumn('event_booking_checkins', 'attendee_position', 'SMALLINT UNSIGNED NULL AFTER booking_id');
  await ensureIndex('event_booking_checkins', 'idx_checkin_booking_day_pos', 'booking_id, entry_date, attendee_position');

  // Offline gate scans carry a device-generated id so replaying the queue is idempotent.
  await ensureColumn('event_booking_checkins', 'client_scan_id', 'VARCHAR(64) NULL AFTER gate');
  const [clientScanKey] = await root.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_booking_checkins'
       AND INDEX_NAME = 'uq_checkin_client_scan' LIMIT 1`,
    [config.db.database],
  );
  if (clientScanKey.length === 0) {
    await root.query('ALTER TABLE event_booking_checkins ADD UNIQUE KEY uq_checkin_client_scan (client_scan_id)');
  }

  // A booking with 5 seats must admit 5 people on the same day, so the old
  // one-check-in-per-booking-per-day unique key has to go.
  const [oldCheckinKey] = await root.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_booking_checkins'
       AND INDEX_NAME = 'uq_checkin_booking_day' AND NON_UNIQUE = 0 LIMIT 1`,
    [config.db.database],
  );
  // The FK uses this index, so the non-unique replacement must exist before the old key goes.
  await ensureIndex('event_booking_checkins', 'idx_checkin_booking_day', 'booking_id, entry_date');
  if (oldCheckinKey.length > 0) {
    await root.query('ALTER TABLE event_booking_checkins DROP INDEX uq_checkin_booking_day');
    console.log('Group entries enabled: removed the one-check-in-per-booking-per-day rule.');
  }

  const [payCols] = await root.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_payments' AND COLUMN_NAME = 'provider'`,
    [config.db.database],
  );
  if (payCols[0] && !String(payCols[0].COLUMN_TYPE).includes('admin')) {
    await root.query(`ALTER TABLE event_payments MODIFY COLUMN provider ENUM('dev','razorpay','admin') NOT NULL DEFAULT 'dev'`);
    console.log('Widened event_payments.provider to allow admin-issued passes.');
  }

  // Event types moved out of a fixed ENUM so the panel can add its own. Existing rows keep
  // their slug; the two original slugs carry the same layout the old hard-coded names implied.
  const [eventKindCol] = await root.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'events' AND COLUMN_NAME = 'kind'`,
    [config.db.database],
  );
  if (eventKindCol[0] && String(eventKindCol[0].COLUMN_TYPE).toLowerCase().startsWith('enum')) {
    await root.query('ALTER TABLE events MODIFY COLUMN kind VARCHAR(32) NOT NULL DEFAULT \'yatra\'');
    console.log('events.kind is now a free slug — admin can add event types.');
  }
  let addedKinds = 0;
  for (const kind of DEFAULT_EVENT_KINDS) {
    const result = await root.query(
      `INSERT IGNORE INTO event_kinds (slug, label_en, label_hi, layout, sort_order, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [kind.slug, kind.label_en, kind.label_hi, kind.layout, kind.sort_order],
    );
    if (result[0]?.affectedRows) addedKinds += 1;
  }
  if (addedKinds > 0) console.log(`Seeded ${addedKinds} event type(s).`);

  // Every state and union territory, so visitors with no yatra city can still find their state.
  // Existing rows keep their own sort order and active flag.
  let addedStates = 0;
  for (let index = 0; index < INDIAN_STATES.length; index += 1) {
    const state = INDIAN_STATES[index];
    const result = await root.query(
      `INSERT IGNORE INTO event_states (code, name_en, name_hi, sort_order, active) VALUES (?, ?, ?, ?, 1)`,
      [state.code, state.name_en, state.name_hi, 100 + index],
    );
    if (result[0]?.affectedRows) addedStates += 1;
  }
  if (addedStates > 0) console.log(`Added ${addedStates} state(s) with no schedule yet.`);

  for (const [key, value] of Object.entries(LEGAL_CONTENT)) {
    await root.query(
      `INSERT INTO event_content (content_key, value_json) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE content_key = content_key`,
      [key, JSON.stringify(value)],
    );
  }

  await root.query(
    `INSERT INTO event_content (content_key, value_json) VALUES ('cookie_banner', ?)
     ON DUPLICATE KEY UPDATE content_key = content_key`,
    [JSON.stringify(COOKIE_BANNER)],
  );

  // Old gate entries only lived on event_bookings.check_in_at, so copy each one across — but keep
  // the copies from repeating. INSERT IGNORE could not guard this: the table's only unique key is
  // client_scan_id and these rows have it NULL, which MySQL treats as distinct, so every run of
  // this script added another entry row and the gate then showed "6 of 3 seats entered today".
  await root.query(
    `DELETE c FROM event_booking_checkins c
       JOIN event_booking_checkins keep
         ON keep.booking_id = c.booking_id AND keep.entry_date = c.entry_date AND keep.id < c.id
        AND keep.gate IS NULL AND keep.attendee_position IS NULL AND keep.client_scan_id IS NULL
       JOIN event_bookings b ON b.id = c.booking_id
      WHERE c.gate IS NULL AND c.attendee_position IS NULL AND c.client_scan_id IS NULL
        AND DATE(b.check_in_at) = c.entry_date AND c.created_at = b.check_in_at
        AND keep.created_at = b.check_in_at`,
  );

  await root.query(
    `INSERT INTO event_booking_checkins (booking_id, entry_date, checked_in_by, created_at)
     SELECT b.id, DATE(b.check_in_at), b.checked_in_by, b.check_in_at
       FROM event_bookings b
       LEFT JOIN event_booking_checkins c
         ON c.booking_id = b.id AND c.entry_date = DATE(b.check_in_at)
      WHERE b.check_in_at IS NOT NULL AND c.id IS NULL`,
  );

  const [adminActive] = await root.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'active'`,
    [config.db.database],
  );
  if (adminActive.length === 0) {
    await root.query('ALTER TABLE admins ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
  }

  // Bumped whenever a session must be revoked (password change, account disable).
  await ensureColumn('admins', 'token_version', 'INT NOT NULL DEFAULT 0 AFTER active');

  console.log(`Schema ready in database "${config.db.database}".`);
  await root.end();
}

main().catch((err) => {
  console.error('DB setup failed:', err.message);
  process.exit(1);
});
