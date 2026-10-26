import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, makeQrToken, makeReference, makeWaitlistRef } from '../lib/util.js';

test('booking references use the AB26 prefix and a safe alphabet', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(makeReference(), /^AB26-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
});

test('waitlist references use the WL prefix', () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(makeWaitlistRef(), /^WL-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  }
});

test('QR tokens are 128-bit hex strings', () => {
  const tokens = new Set();
  for (let i = 0; i < 100; i += 1) {
    const token = makeQrToken();
    assert.match(token, /^[0-9a-f]{32}$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 100);
});

test('HttpError keeps its status and details', () => {
  const error = new HttpError(409, 'Payment required', { extraDue: 500 });
  assert.equal(error.status, 409);
  assert.equal(error.message, 'Payment required');
  assert.deepEqual(error.details, { extraDue: 500 });
  assert.ok(error instanceof Error);
});
