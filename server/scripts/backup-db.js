import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(here, '..', '..', 'backups'));
const keep = Math.max(1, Number(process.env.BACKUP_KEEP || 14));
const dumpBin = process.env.MYSQLDUMP_PATH || 'mysqldump';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `${config.db.database}-${stamp}.sql.gz`);

await mkdir(backupDir, { recursive: true });

const dump = spawn(
  dumpBin,
  [
    `--host=${config.db.host}`,
    `--port=${config.db.port}`,
    `--user=${config.db.user}`,
    '--single-transaction',
    '--quick',
    '--skip-lock-tables',
    '--routines',
    '--triggers',
    '--default-character-set=utf8mb4',
    '--set-gtid-purged=OFF',
    config.db.database,
  ],
  {
    // Keep the password out of the process list and shell history.
    env: { ...process.env, MYSQL_PWD: config.db.password },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

let stderr = '';
dump.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const closed = new Promise((resolve, reject) => {
  dump.on('error', reject);
  dump.on('close', resolve);
});

try {
  await pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(target));
  const exitCode = await closed;
  if (exitCode !== 0) throw new Error(stderr.trim() || `mysqldump exited with ${exitCode}`);
} catch (err) {
  await unlink(target).catch(() => {});
  console.error(`[backup] failed: ${err.message}`);
  console.error(`[backup] check that "${dumpBin}" is installed and DB_* values in .env are correct.`);
  process.exit(1);
}

const info = await stat(target);
console.log(`[backup] wrote ${path.relative(process.cwd(), target)} (${(info.size / 1024).toFixed(1)} KB)`);

const files = (await readdir(backupDir))
  .filter((name) => name.endsWith('.sql.gz'))
  .sort()
  .reverse();
for (const name of files.slice(keep)) {
  await unlink(path.join(backupDir, name));
  console.log(`[backup] pruned ${name}`);
}
console.log(`[backup] keeping the newest ${keep} backup(s) in ${backupDir}`);
