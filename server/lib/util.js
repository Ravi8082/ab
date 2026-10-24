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
