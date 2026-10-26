import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-only-secret';
const { priceOnDate } = await import('../lib/ticketPricing.js');
const { pool } = await import('../db.js');

after(() => pool.end());

test('without slabs the list price is charged', () => {
  const result = priceOnDate({ price: 500, original_price: 600 }, [], '2027-06-12');
  assert.equal(result.price, 500);
  assert.equal(result.list_price, 500);
  assert.equal(result.actual_price, 600);
  assert.equal(result.discount_percent, 17);
  assert.equal(result.price_effective_from, null);
  assert.equal(result.next_price, null);
});

test('the latest slab on or before the date wins', () => {
  const slabs = [
    { effective_from: '2027-07-01', price: 700, label_en: 'Full price' },
    { effective_from: '2027-06-01', price: 400, label_en: 'Early bird' },
  ];
  const result = priceOnDate({ price: 500, original_price: null }, slabs, '2027-06-15');
  assert.equal(result.price, 400);
  assert.equal(result.price_label_en, 'Early bird');
  assert.equal(result.price_effective_from, '2027-06-01');
  assert.equal(result.actual_price, 500);
  assert.equal(result.discount_percent, 20);
  assert.equal(result.next_price, 700);
  assert.equal(result.next_price_from, '2027-07-01');
});

test('before the first slab the list price applies and the next rise is returned', () => {
  const result = priceOnDate(
    { price: 500, original_price: 500 },
    [{ effective_from: '2027-06-01', price: 400 }],
    '2027-05-20',
  );
  assert.equal(result.price, 500);
  assert.equal(result.actual_price, null);
  assert.equal(result.price_effective_from, null);
  assert.equal(result.next_price, 400);
});

test('date objects are compared in UTC and future slabs are ignored', () => {
  const slabs = [
    { effective_from: '2027-06-01', price: 400 },
    { effective_from: '2027-08-01', price: 900 },
  ];
  const result = priceOnDate({ price: 500 }, slabs, new Date('2027-07-02T00:00:00Z'));
  assert.equal(result.price, 400);
  assert.equal(result.next_price, 900);
  assert.equal(result.next_price_from, '2027-08-01');
});
