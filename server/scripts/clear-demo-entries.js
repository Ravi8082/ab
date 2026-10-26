import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Test scans made during development leave entries in the gate tables, so a live gate would open
 * with "seats already used" for bookings that nobody attended. This clears those rows and keeps a
 * JSON backup first, because the same script has to be safe to run on the real database.
 *
 *   node server/scripts/clear-demo-entries.js        # show what would go
 *   node server/scripts/clear-demo-entries.js --yes  # back up to backups/ and clear
 */
async function main() {
  const apply = process.argv.includes('--yes');

  const checkins = await query(
    `SELECT c.*, b.reference FROM event_booking_checkins c
     JOIN event_bookings b ON b.id = c.booking_id ORDER BY c.id`,
  );
  const denials = await query('SELECT * FROM event_scan_denials ORDER BY id');
  const audit = await query(`SELECT * FROM audit_log WHERE action LIKE 'event.check_in%' ORDER BY id`);
  const bookings = await query(
    `SELECT id, reference, check_in_at, checked_in_by FROM event_bookings
      WHERE check_in_at IS NOT NULL OR checked_in_by IS NOT NULL ORDER BY id`,
  );
  const usedCodes = await query('SELECT id, booking_id, used_at, used_gate FROM event_pass_codes WHERE used_at IS NOT NULL');

  console.log(
    `gate entries: ${checkins.length} · rejected scans: ${denials.length} · entry audit rows: ${audit.length}` +
      ` · bookings marked entered: ${bookings.length} · live QRs marked used: ${usedCodes.length}`,
  );

  if (!apply) {
    console.log('Dry run — nothing changed. Re-run with --yes to back up and clear.');
    await pool.end();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(here, '../../backups');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `gate-entries-${stamp}.json`);
  await fs.writeFile(file, JSON.stringify({ checkins, denials, audit, bookings, usedCodes }, null, 2), 'utf8');
  console.log(`Backup written to ${file}`);

  await query('DELETE FROM event_booking_checkins');
  await query('DELETE FROM event_scan_denials');
  await query(`DELETE FROM audit_log WHERE action LIKE 'event.check_in%'`);
  await query(
    `UPDATE event_bookings SET check_in_at = NULL, checked_in_by = NULL
      WHERE check_in_at IS NOT NULL OR checked_in_by IS NOT NULL`,
  );
  await query('UPDATE event_pass_codes SET used_at = NULL, used_gate = NULL WHERE used_at IS NOT NULL');

  const left = await query('SELECT COUNT(*) AS n FROM event_booking_checkins');
  const flagged = await query('SELECT COUNT(*) AS n FROM event_bookings WHERE check_in_at IS NOT NULL');
  console.log(`Entries cleared — check-in rows left: ${left[0].n}, bookings still marked entered: ${flagged[0].n}.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Clearing gate entries failed:', err.message);
  process.exit(1);
});
