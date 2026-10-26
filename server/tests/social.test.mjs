import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-only-secret';
process.env.PUBLIC_SITE_URL = 'https://event.example.test';
const { isRealSocialUrl } = await import('../lib/social.js');
const { pool } = await import('../db.js');

after(() => pool.end());

test('placeholder values pointing back at the event site are ignored', () => {
  assert.equal(isRealSocialUrl('instagram', 'https://event.example.test/'), false);
  assert.equal(isRealSocialUrl('facebook', 'https://www.event.example.test/'), false);
});

test('real platform profile URLs are accepted', () => {
  assert.equal(isRealSocialUrl('instagram', 'https://www.instagram.com/adhyatmikbharat/'), true);
  assert.equal(isRealSocialUrl('facebook', 'https://facebook.com/adhyatmikbharat'), true);
  assert.equal(isRealSocialUrl('youtube', 'https://youtu.be/abc123'), true);
  assert.equal(isRealSocialUrl('linkedin', 'https://in.linkedin.com/company/adhyatmik'), true);
});

test('invalid and mismatched URLs are rejected', () => {
  assert.equal(isRealSocialUrl('instagram', 'not-a-url'), false);
  assert.equal(isRealSocialUrl('instagram', ''), false);
  assert.equal(isRealSocialUrl('youtube', 'https://vimeo.com/adhyatmik'), false);
  assert.equal(isRealSocialUrl('linkedin', 'javascript:alert(1)'), false);
});
