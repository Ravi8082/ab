import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { HttpError } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(here, '..', 'uploads');
const KYC_ROOT = path.join(UPLOAD_ROOT, 'staff-kyc');
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 1024;

export const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The browser's advertised MIME type is attacker-controlled, so the file is classified by its
 * own bytes. Anything that is not a plain JPG/PNG/WEBP/PDF header is refused, which also keeps
 * SVG and script-bearing containers out of the upload directory.
 */
export function detectFileType(buffer) {
  if (!buffer || buffer.length < 5) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (PNG_HEADER.every((byte, index) => buffer[index] === byte)) return 'image/png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export const KYC_FILE_COLUMNS = {
  aadhaar: 'aadhaar_photo',
  pan: 'pan_photo',
  other: 'other_doc_photo',
};

export function maskIdNumber(value) {
  if (!value) return null;
  const text = String(value).replace(/\s+/g, '');
  if (text.length <= 4) return `•••• ${text}`;
  return `•••• ${text.slice(-4)}`;
}

export async function saveKycFile(adminId, kind, file) {
  if (!file || typeof file.data !== 'string' || !file.mime) {
    throw new HttpError(400, 'Choose a file to upload.');
  }
  // base64 grows by ~4/3, so cap the encoded string before decoding to bound memory use.
  if (file.data.length > MAX_BASE64_CHARS) throw new HttpError(413, 'Each document must be 4 MB or smaller.');
  const buffer = Buffer.from(file.data, 'base64');
  if (!buffer.length) throw new HttpError(400, 'The uploaded file is empty.');
  if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, 'Each document must be 4 MB or smaller.');

  const mime = detectFileType(buffer);
  if (!mime) throw new HttpError(400, 'Documents must be a JPG, PNG, WEBP image or a PDF.');
  const ext = MIME_EXT[mime];

  const dir = path.join(KYC_ROOT, String(adminId));
  await fs.mkdir(dir, { recursive: true });
  const filename = `${kind}-${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(dir, filename), buffer);
  return path.posix.join('staff-kyc', String(adminId), filename);
}

export function resolveKycFile(relativePath) {
  if (!relativePath) return null;
  const normalized = String(relativePath).replace(/\\/g, '/');
  if (!normalized.startsWith('staff-kyc/')) return null;
  const absolute = path.resolve(UPLOAD_ROOT, normalized);
  const root = `${KYC_ROOT}${path.sep}`;
  return absolute.startsWith(root) ? absolute : null;
}

export async function removeKycFile(relativePath) {
  const absolute = resolveKycFile(relativePath);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => undefined);
}

export async function removeKycDir(adminId) {
  await fs.rm(path.join(KYC_ROOT, String(adminId)), { recursive: true, force: true });
}
