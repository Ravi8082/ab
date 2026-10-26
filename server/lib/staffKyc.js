import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { HttpError } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.resolve(here, '..', 'uploads');
const KYC_ROOT = path.join(UPLOAD_ROOT, 'staff-kyc');
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

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
  const ext = MIME_EXT[String(file.mime).toLowerCase()];
  if (!ext) throw new HttpError(400, 'Documents must be a JPG, PNG, WEBP image or a PDF.');
  const buffer = Buffer.from(file.data, 'base64');
  if (!buffer.length) throw new HttpError(400, 'The uploaded file is empty.');
  if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, 'Each document must be 4 MB or smaller.');

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
