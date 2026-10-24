import mysql from 'mysql2/promise';
import { config } from './config.js';

const { poolSize, ...dbConfig } = config.db;

export const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: poolSize,
  maxIdle: poolSize,
  idleTimeout: 60_000,
  queueLimit: 0,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  charset: 'utf8mb4',
  dateStrings: true,
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function pingDatabase() {
  await pool.query('SELECT 1');
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
