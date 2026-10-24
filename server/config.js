import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The shared .env lives one level above server/
dotenv.config({ path: path.join(here, '..', '.env') });

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing env: ${name}`);
  return value;
}

function parseTrustProxy(raw) {
  if (raw === undefined || raw === '') return 1;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

export const config = {
  port: Number(process.env.API_PORT || 4000),
  siteUrl: process.env.PUBLIC_SITE_URL || 'http://localhost:5173',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  webConcurrency: Math.max(1, Number(process.env.WEB_CONCURRENCY || 1)),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER', 'root'),
    password: required('DB_PASSWORD', ''),
    database: required('DB_NAME', 'ar'),
    poolSize: Math.max(2, Number(process.env.DB_POOL_SIZE || 20)),
  },
  jwtSecret: required('JWT_SECRET'),
  paymentDevMode: process.env.PAYMENT_DEV_MODE !== 'false',
  otpDevMode: process.env.OTP_DEV_MODE !== 'false',
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Adhyatmik Bharat <no-reply@adhyatmikbharatexpo.com>',
  },
  supportEmail: process.env.SUPPORT_EMAIL || 'adhyatmikbharatexpo@gmail.com',
  reminders: {
    enabled: process.env.REMINDERS_ENABLED !== 'false',
    intervalMs: Math.max(60_000, Number(process.env.REMINDER_INTERVAL_MS || 300_000)),
  },
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Admin',
  },
};
