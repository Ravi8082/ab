import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { INDIAN_STATES } from '../lib/indianStates.js';
import { LEGAL_CONTENT } from './legal-content.js';

const here = path.dirname(fileURLToPath(import.meta.url));

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

  // Which physical gate took the entry, so a QR forwarded to another gate is visible.
  await ensureColumn('event_booking_checkins', 'gate', 'VARCHAR(60) NULL AFTER checked_in_by');
  await ensureColumn('event_scan_denials', 'other_gate', "TINYINT(1) NOT NULL DEFAULT 0 AFTER gate");

  const [payCols] = await root.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'event_payments' AND COLUMN_NAME = 'provider'`,
    [config.db.database],
  );
  if (payCols[0] && !String(payCols[0].COLUMN_TYPE).includes('admin')) {
    await root.query(`ALTER TABLE event_payments MODIFY COLUMN provider ENUM('dev','razorpay','admin') NOT NULL DEFAULT 'dev'`);
    console.log('Widened event_payments.provider to allow admin-issued passes.');
  }

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
    `INSERT IGNORE INTO event_booking_checkins (booking_id, entry_date, checked_in_by, created_at)
     SELECT id, DATE(check_in_at), checked_in_by, check_in_at
     FROM event_bookings WHERE check_in_at IS NOT NULL`,
  );

  const [adminActive] = await root.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'active'`,
    [config.db.database],
  );
  if (adminActive.length === 0) {
    await root.query('ALTER TABLE admins ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
  }

  console.log(`Schema ready in database "${config.db.database}".`);
  await root.end();
}

main().catch((err) => {
  console.error('DB setup failed:', err.message);
  process.exit(1);
});
