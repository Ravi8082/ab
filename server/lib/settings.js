import { query } from '../db.js';
import { config } from '../config.js';

export const SALES_DEFAULTS = {
  paused: false,
  message_en: 'Online booking is temporarily paused. Please check back shortly or contact our help desk.',
  message_hi:
    'ऑनलाइन बुकिंग थोड़ी देर के लिए रोकी गई है। कृपया थोड़ी देर बाद देखें या हमारी सहायता टीम से संपर्क करें।',
  resume_at: null,
  reminders_enabled: true,
};

let cache = { at: 0, value: null };
const CACHE_MS = 5000;

function normalize(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  if (!value || typeof value !== 'object') value = {};
  return {
    paused: Boolean(value.paused),
    message_en: String(value.message_en || SALES_DEFAULTS.message_en).slice(0, 400),
    message_hi: String(value.message_hi || SALES_DEFAULTS.message_hi).slice(0, 500),
    resume_at: value.resume_at ? String(value.resume_at).slice(0, 19) : null,
    reminders_enabled: value.reminders_enabled !== false,
  };
}

export async function getSalesSettings({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [row] = await query(
    'SELECT value_json, updated_at FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['sales'],
  );
  const value = { ...normalize(row?.value_json), updated_at: row?.updated_at ?? null };
  cache = { at: Date.now(), value };
  return value;
}

export function isSalesClosed(settings, now = Date.now()) {
  if (!settings?.paused) return false;
  if (!settings.resume_at) return true;
  const resume = Date.parse(String(settings.resume_at).replace(' ', 'T'));
  return !Number.isFinite(resume) || resume > now;
}

export function publicSalesState(settings) {
  return {
    paused: isSalesClosed(settings),
    message_en: settings.message_en,
    message_hi: settings.message_hi,
    resume_at: settings.paused ? settings.resume_at : null,
  };
}

export async function saveSalesSettings(input, adminId = null) {
  const current = await getSalesSettings({ fresh: true });
  const next = normalize({ ...current, ...input });
  await query(
    `INSERT INTO app_settings (setting_key, value_json, updated_by)
     VALUES ('sales', ?, ?)
     ON DUPLICATE KEY UPDATE value_json = ?, updated_by = ?`,
    [JSON.stringify(next), adminId, JSON.stringify(next), adminId],
  );
  cache = { at: 0, value: null };
  return getSalesSettings({ fresh: true });
}

export function smtpConfigured() {
  return Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
}
