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
  // Only trust forwarded headers when the API actually sits behind a proxy.
  if (raw === undefined || raw === '' || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return true;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

const isProduction = process.env.NODE_ENV === 'production';
const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173';
const jwtSecret = required('JWT_SECRET');
const dbUser = required('DB_USER', 'root');
const razorpay = {
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
};
const smtp = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'Adhyatmik Bharat <no-reply@adhyatmikbharatexpo.com>',
};

if (jwtSecret.length < 32 || jwtSecret === 'replace-with-a-long-random-secret') {
  if (isProduction) {
    throw new Error('JWT_SECRET must be a unique random value of at least 32 characters in production.');
  }
  console.warn('[security] JWT_SECRET is short or still the example value. Generate a long random secret for production.');
}

if (isProduction) {
  const blockers = [];
  if (process.env.PAYMENT_DEV_MODE !== 'false') blockers.push('PAYMENT_DEV_MODE must be false');
  if (process.env.OTP_DEV_MODE !== 'false') blockers.push('OTP_DEV_MODE must be false');
  if (blockers.length) {
    throw new Error(`Refusing to start in production with simulated integrations: ${blockers.join('; ')}.`);
  }
  if (dbUser === 'root') console.warn('[security] DB_USER=root — use a dedicated least-privilege MySQL user before go-live.');
  if (!siteUrl.startsWith('https://')) console.warn('[security] PUBLIC_SITE_URL should be the real HTTPS origin in production.');
  if (!razorpay.keyId || !razorpay.keySecret) console.warn('[security] Razorpay keys are missing; online payments will fail.');
  if (!razorpay.webhookSecret) console.warn('[security] RAZORPAY_WEBHOOK_SECRET is missing; webhook events will be refused.');
  if (!smtp.host || !smtp.pass) console.warn('[security] SMTP is not configured; booking and OTP emails will not be delivered.');
}

export const config = {
  isProduction,
  port: Number(process.env.API_PORT || 4000),
  siteUrl,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  webConcurrency: Math.max(1, Number(process.env.WEB_CONCURRENCY || 1)),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: dbUser,
    password: required('DB_PASSWORD', ''),
    database: required('DB_NAME', 'ar'),
    poolSize: Math.max(2, Number(process.env.DB_POOL_SIZE || 20)),
  },
  jwtSecret,
  paymentDevMode: process.env.PAYMENT_DEV_MODE !== 'false',
  otpDevMode: process.env.OTP_DEV_MODE !== 'false',
  razorpay,
  smtp,
  supportEmail: process.env.SUPPORT_EMAIL || 'adhyatmikbharatexpo@gmail.com',
  social: {
    instagram: process.env.SOCIAL_INSTAGRAM || '',
    facebook: process.env.SOCIAL_FACEBOOK || '',
    youtube: process.env.SOCIAL_YOUTUBE || '',
    linkedin: process.env.SOCIAL_LINKEDIN || '',
  },
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
