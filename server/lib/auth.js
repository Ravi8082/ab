import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError } from './util.js';

export const ADMIN_COOKIE = config.isProduction ? '__Host-ab_admin' : 'ab_admin';
export const LEGACY_ADMIN_COOKIE = 'ab_admin';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction,
  path: '/',
  priority: 'high',
};

export function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      name: admin.name,
      ver: Number(admin.token_version || 0),
    },
    config.jwtSecret,
    { expiresIn: '8h', issuer: 'adhyatmik-bharat', algorithm: 'HS256' },
  );
}

export function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 8 * 60 * 60 * 1000 });
}

export function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, COOKIE_OPTIONS);
  // Cookies issued before the __Host- switch are removed as well.
  res.clearCookie(LEGACY_ADMIN_COOKIE, COOKIE_OPTIONS);
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
      payload = jwt.verify(token, config.jwtSecret, {
        issuer: 'adhyatmik-bharat',
        algorithms: ['HS256'],
      });
    } catch {
      throw new HttpError(401, 'Session expired. Sign in again.');
    }

    const [admin] = await query(
      'SELECT id, email, name, role, active, token_version FROM admins WHERE id = ? LIMIT 1',
      [payload.sub],
    );
    if (!admin) throw new HttpError(401, 'Account not found.');
    if (!Number(admin.active)) throw new HttpError(403, 'This account is disabled.');
    // Password changes and staff resets bump this, so older cookies stop working.
    if (payload.ver === undefined || Number(payload.ver) !== Number(admin.token_version)) {
      throw new HttpError(401, 'Session expired. Sign in again.');
    }
    delete admin.active;
    delete admin.token_version;
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
  const ip = req.ip || req.socket?.remoteAddress || '';
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return normalized ? normalized.slice(0, 64) : null;
}

export async function audit({ actorType, actorId = null, action, entity = null, entityId = null, meta = null, ip = null }) {
  await query(
    'INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [actorType, actorId, action, entity, entityId, meta ? JSON.stringify(meta) : null, ip],
  );
}
