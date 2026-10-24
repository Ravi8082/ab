import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from './util.js';

export const ADMIN_COOKIE = 'ab_admin';

export function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.id, email: admin.email, role: admin.role, name: admin.name },
    config.jwtSecret,
    { expiresIn: '8h', issuer: 'adhyatmik-bharat' },
  );
}

export function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[ADMIN_COOKIE] || null;
}

export async function requireAdmin(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) throw new HttpError(401, 'Please sign in.');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { issuer: 'adhyatmik-bharat' });
    } catch {
      throw new HttpError(401, 'Session expired. Sign in again.');
    }

    const [admin] = await query(
      'SELECT id, email, name, role, active FROM admins WHERE id = ? LIMIT 1',
      [payload.sub],
    );
    if (!admin) throw new HttpError(401, 'Account not found.');
    if (!Number(admin.active)) throw new HttpError(403, 'This account is disabled.');
    delete admin.active;
    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.admin) return next(new HttpError(401, 'Please sign in.'));
    if (!roles.includes(req.admin.role)) {
      return next(new HttpError(403, 'You do not have permission for this action.'));
    }
    return next();
  };
}

export function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || null;
}

export async function audit({ actorType, actorId = null, action, entity = null, entityId = null, meta = null, ip = null }) {
  await query(
    'INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [actorType, actorId, action, entity, entityId, meta ? JSON.stringify(meta) : null, ip],
  );
}
