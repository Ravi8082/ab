import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-only-secret';
const { discountFor, normalizeCode } = await import('../lib/offers.js');
const { pool } = await import('../db.js');

after(() => pool.end());

test('coupon codes are trimmed, uppercased and stripped of unsafe characters', () => {
  assert.equal(normalizeCode('  sundar-20 '), 'SUNDAR-20');
  assert.equal(normalizeCode('a@b#c'), 'ABC');
  assert.equal(normalizeCode('radhe_radhe'), 'RADHERADHE');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode('X'.repeat(40)).length, 32);
});

test('percent discounts round and cap at the gross amount', () => {
  assert.equal(discountFor('percent', 20, 500), 100);
  assert.equal(discountFor('percent', 33, 999), 330);
  assert.equal(discountFor('percent', 150, 500), 500);
  assert.equal(discountFor('percent', -10, 500), 0);
});

test('flat discounts never exceed the gross amount', () => {
  assert.equal(discountFor('flat', 300, 500), 300);
  assert.equal(discountFor('flat', 900, 500), 500);
  assert.equal(discountFor('flat', -100, 500), 0);
  assert.equal(discountFor('flat', 100, 0), 0);
});
