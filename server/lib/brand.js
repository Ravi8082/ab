import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { query } from '../db.js';
import { HttpError } from './util.js';
import { MIME_EXT, detectFileType } from './staffKyc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(here, '..', 'uploads');
const BRAND_ROOT = path.join(UPLOAD_ROOT, 'brand');

export const BRAND_FIELDS = ['logo', 'favicon'];
const BRAND_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BRAND_BYTES = 2 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_BRAND_BYTES / 3) * 4 + 1024;

export const BRAND_DEFAULTS = {
  name_en: 'Adhyatmik Bharat',
  name_hi: 'आध्यात्मिक भारत',
  tagline_en: 'Sundarkand Yatra · Expo 2027',
  tagline_hi: 'सुंदरकांड यात्रा · एक्स्पो 2027',
};

let cache = { at: 0, value: null };
const CACHE_MS = 5000;

function text(value, fallback, max) {
  const clean = String(value ?? '').trim();
  return (clean || fallback).slice(0, max);
}

function normalizeImage(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.path !== 'string') return null;
  if (!raw.path.startsWith('brand/')) return null;
  return {
    path: raw.path.slice(0, 190),
    mime: MIME_EXT[raw.mime] ? String(raw.mime) : 'image/png',
    size: Number(raw.size) > 0 ? Number(raw.size) : 0,
  };
}

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
    name_en: text(value.name_en, BRAND_DEFAULTS.name_en, 60),
    name_hi: text(value.name_hi, BRAND_DEFAULTS.name_hi, 60),
    tagline_en: text(value.tagline_en, BRAND_DEFAULTS.tagline_en, 90),
    tagline_hi: text(value.tagline_hi, BRAND_DEFAULTS.tagline_hi, 90),
    logo: normalizeImage(value.logo),
    favicon: normalizeImage(value.favicon),
  };
}

async function persist(next, adminId = null) {
  const value = normalize(next);
  const json = JSON.stringify(value);
  await query(
    `INSERT INTO app_settings (setting_key, value_json, updated_by)
     VALUES ('brand', ?, ?)
     ON DUPLICATE KEY UPDATE value_json = ?, updated_by = ?`,
    [json, adminId, json, adminId],
  );
  cache = { at: 0, value: null };
  return value;
}

export async function getBrand({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [row] = await query('SELECT value_json FROM app_settings WHERE setting_key = ? LIMIT 1', ['brand']);
  const value = normalize(row?.value_json);
  cache = { at: Date.now(), value };
  return value;
}

export function resolveBrandFile(relativePath) {
  if (!relativePath) return null;
  const normalized = String(relativePath).replace(/\\/g, '/');
  if (!normalized.startsWith('brand/')) return null;
  const absolute = path.resolve(UPLOAD_ROOT, normalized);
  const root = `${BRAND_ROOT}${path.sep}`;
  return absolute.startsWith(root) ? absolute : null;
}

/** The path carries a random suffix, so it doubles as the cache-busting version in the URL. */
function imageUrl(field, image) {
  if (!image) return null;
  return `/api/brand/image/${field}?v=${path.posix.basename(image.path)}`;
}

export function publicBrand(brand) {
  const favicon = brand.favicon || brand.logo;
  return {
    ...brand,
    logo_url: imageUrl('logo', brand.logo),
    favicon_url: imageUrl('favicon', favicon),
    favicon_mime: favicon?.mime ?? null,
  };
}

export function brandImage(brand, field) {
  if (!BRAND_FIELDS.includes(field)) return null;
  // A site tab still needs a mark when only the logo was uploaded.
  return brand[field] || (field === 'favicon' ? brand.logo : null);
}

export async function saveBrand(input, adminId = null) {
  const current = await getBrand({ fresh: true });
  return persist({ ...current, ...input }, adminId);
}

/** The browser's advertised MIME type is attacker-controlled, so the bytes alone decide what is stored. */
export function brandImageType(buffer) {
  if (!buffer || !buffer.length) throw new HttpError(400, 'The uploaded file is empty.');
  if (buffer.length > MAX_BRAND_BYTES) throw new HttpError(413, 'Each image must be 2 MB or smaller.');
  const mime = detectFileType(buffer);
  if (!BRAND_IMAGE_MIMES.has(mime)) throw new HttpError(400, 'Use a JPG, PNG or WEBP image.');
  return mime;
}

export async function uploadBrandImage(field, file, adminId = null) {
  if (!BRAND_FIELDS.includes(field)) throw new HttpError(400, 'Choose either the logo or the favicon.');
  if (!file || typeof file.data !== 'string' || !file.data) throw new HttpError(400, 'Choose an image to upload.');
  // base64 grows by ~4/3, so the encoded string is capped before decoding to bound memory use.
  if (file.data.length > MAX_BASE64_CHARS) throw new HttpError(413, 'Each image must be 2 MB or smaller.');

  const buffer = Buffer.from(file.data, 'base64');
  const mime = brandImageType(buffer);

  const current = await getBrand({ fresh: true });
  await fs.mkdir(BRAND_ROOT, { recursive: true });
  const filename = `${field}-${Date.now()}-${randomBytes(4).toString('hex')}.${MIME_EXT[mime]}`;
  await fs.writeFile(path.join(BRAND_ROOT, filename), buffer);

  const image = { path: path.posix.join('brand', filename), mime, size: buffer.length };
  const next = await persist({ ...current, [field]: image }, adminId);
  const previous = resolveBrandFile(current[field]?.path);
  if (previous) await fs.unlink(previous).catch(() => undefined);
  return next;
}

export async function removeBrandImage(field, adminId = null) {
  if (!BRAND_FIELDS.includes(field)) throw new HttpError(400, 'Choose either the logo or the favicon.');
  const current = await getBrand({ fresh: true });
  const absolute = resolveBrandFile(current[field]?.path);
  if (absolute) await fs.unlink(absolute).catch(() => undefined);
  return persist({ ...current, [field]: null }, adminId);
}

