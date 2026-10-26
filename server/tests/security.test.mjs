import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordProblems, strongPassword } from '../lib/passwords.js';
import { csvCell, csvRow } from '../lib/csv.js';
import { detectFileType } from '../lib/staffKyc.js';
import { brandImageType } from '../lib/brand.js';
import { normalizePositions } from '../lib/checkin.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBPVP8 ', 'ascii')]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n', 'latin1');

test('password policy accepts only sufficiently strong values', () => {
  assert.deepEqual(passwordProblems('Sunrise2026!'), []);
  assert.ok(strongPassword.safeParse('Sunrise2026!').success);

  assert.ok(passwordProblems('short1A').length);
  assert.ok(passwordProblems('alllowercase1').length);
  assert.ok(passwordProblems('ALLUPPERCASE1').length);
  assert.ok(passwordProblems('NoNumbersHere').length);
});

test('password policy rejects obvious guesses', () => {
  assert.ok(passwordProblems('adhyatmikbharat').includes('Choose a password that is not a common guess.'));
  assert.ok(passwordProblems('Admin12345').includes('Choose a password that is not a common guess.'));
});

test('csv cells that start with a formula operator are neutralised', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1234'), "'+1234");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvRow(['=cmd', 'safe']), "'=cmd,safe");
});

test('csv quoting still escapes commas, quotes and newlines', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('plain text'), 'plain text');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('2026-10-26 12:00:00'), '2026-10-26 12:00:00');
});

test('uploads are classified by file bytes, not the browser MIME type', () => {
  assert.equal(detectFileType(JPEG), 'image/jpeg');
  assert.equal(detectFileType(PNG), 'image/png');
  assert.equal(detectFileType(WEBP), 'image/webp');
  assert.equal(detectFileType(PDF), 'application/pdf');

  assert.equal(detectFileType(Buffer.from('<script>alert(1)</script>', 'utf8')), null);
  assert.equal(detectFileType(Buffer.from('%PS-1.4 postscript document', 'latin1')), null);
  assert.equal(detectFileType(Buffer.from('GIF89a')), null);
  assert.equal(detectFileType(Buffer.alloc(0)), null);
  assert.equal(detectFileType(null), null);
});

test('brand images accept only flat raster types and refuse a PDF or SVG', () => {
  assert.equal(brandImageType(JPEG), 'image/jpeg');
  assert.equal(brandImageType(PNG), 'image/png');
  assert.equal(brandImageType(WEBP), 'image/webp');

  const statusOf = (buffer) => {
    try {
      brandImageType(buffer);
    } catch (err) {
      return err.status;
    }
    return 'accepted';
  };

  assert.equal(statusOf(PDF), 400);
  assert.equal(statusOf(Buffer.from('<svg onload="alert(1)"></svg>', 'utf8')), 400);
  assert.equal(statusOf(Buffer.from('GIF89a')), 400);
  assert.equal(statusOf(Buffer.alloc(0)), 400);
  assert.equal(statusOf(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])), 413);
});

test('gate batch admission keeps only unique positive attendee numbers', () => {
  assert.deepEqual(normalizePositions(['3', 1, 1, '2']), [1, 2, 3]);
  assert.equal(normalizePositions(undefined), null);
  assert.equal(normalizePositions([]), null);

  const statusOf = (value) => {
    try {
      normalizePositions(value);
    } catch (err) {
      return err.status;
    }
    return 'accepted';
  };

  assert.equal(statusOf([{ notAPosition: 1 }]), 400);
  assert.equal(statusOf([0]), 400);
  assert.equal(statusOf([1.5]), 400);
  assert.equal(statusOf(Array.from({ length: 201 }, (_, index) => index + 1)), 400);
});
