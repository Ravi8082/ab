import { randomBytes, randomInt } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeReference() {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return `AB26-${out}`;
}

export function makeWaitlistRef() {
  let out = '';
  for (let i = 0; i < 6; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return `WL-${out}`;
}

export const makeQrToken = () => randomBytes(16).toString('hex');

/** URL slug from a display name — Hindi and accented characters fold to ASCII. */
export function slugify(value, fallback = 'item') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return slug || fallback;
}
