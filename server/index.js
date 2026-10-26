import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import cluster from 'node:cluster';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { publicRouter, razorpayWebhookHandler } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { staffRouter } from './routes/staff.js';
import { startReminderScheduler } from './lib/reminders.js';
import { ADMIN_COOKIE, LEGACY_ADMIN_COOKIE } from './lib/auth.js';
import { HttpError } from './lib/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, '..', 'dist');

function normalizeOrigin(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** CSP hashes for the inline JSON-LD blocks in the built index.html. */
function inlineScriptHashes() {
  try {
    const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    const hashes = new Set();
    const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = pattern.exec(html))) {
      if (!match[1].trim()) continue;
      hashes.add(`'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`);
    }
    return [...hashes];
  } catch {
    return [];
  }
}

function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"],
          'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https://*.razorpay.com'],
          'object-src': ["'none'"],
          'script-src': ["'self'", 'https://checkout.razorpay.com', ...inlineScriptHashes()],
          'script-src-attr': ["'none'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'connect-src': [
            "'self'",
            'https://api.razorpay.com',
            'https://checkout.razorpay.com',
            'https://lumberjack.razorpay.com',
            // drei's <Environment preset="night"> pulls the hero's HDR from this pinned CDN commit
            // (raw.githack.com redirects to raw.githubusercontent.com).
            'https://raw.githack.com',
            'https://raw.githubusercontent.com',
          ],
          'worker-src': ["'self'", 'blob:'],
          'media-src': ["'self'"],
          'manifest-src': ["'self'"],
          ...(config.isProduction ? { 'upgrade-insecure-requests': [] } : {}),
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      frameguard: { action: 'deny' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const devOrigins = config.isProduction
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4000', 'http://127.0.0.1:4000'];
  const allowedOrigins = [...new Set([config.siteUrl, ...devOrigins, ...configuredOrigins].map(normalizeOrigin).filter(Boolean))];

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    }),
  );

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl === '/api/payments/razorpay/webhook',
    message: { error: 'Too many requests. Please slow down and try again.' },
  });
  app.use('/api', apiLimiter);

  app.use(compression({ threshold: 1024 }));
  // Razorpay signs the exact raw body, so this route must run before express.json().
  app.post(
    '/api/payments/razorpay/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    razorpayWebhookHandler,
  );

  // Only the upload routes may carry a large body; everything else stays small.
  const kycBodyParser = express.json({ limit: '6mb' });
  const brandBodyParser = express.json({ limit: '4mb' });
  app.use((req, res, next) => {
    if (req.method === 'POST') {
      if (/^\/api\/admin\/staff\/\d+\/kyc\/file\/(aadhaar|pan|other)\/?$/.test(req.path)) {
        return kycBodyParser(req, res, next);
      }
      if (/^\/api\/admin\/settings\/brand\/image\/?$/.test(req.path)) return brandBodyParser(req, res, next);
    }
    return next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Cookie-authenticated writes must originate from our own site. Bearer-token
  // clients are not vulnerable to CSRF, so they skip this check.
  app.use(['/api/admin', '/api/staff'], (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('authorization')?.startsWith('Bearer ')) return next();
    const hasSession = Boolean(req.cookies?.[ADMIN_COOKIE] || req.cookies?.[LEGACY_ADMIN_COOKIE]);
    if (!hasSession) return next();

    let origin = req.get('origin') || null;
    if (!origin) {
      try {
        origin = new URL(req.get('referer')).origin;
      } catch {
        origin = null;
      }
    }
    const selfOrigin = normalizeOrigin(`${req.protocol}://${req.get('host')}`);
    if (origin && (origin === selfOrigin || allowedOrigins.includes(origin))) return next();
    return res.status(403).json({ error: 'This request was blocked for security reasons.' });
  });

  app.use(['/api/admin', '/api/staff'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.use('/api/admin', adminRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api', publicRouter);
  if (fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
          }
        },
      }),
    );
    app.get(/^\/(?!api).*/, (_req, res) =>
      res.sendFile(path.join(distDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }),
    );
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
      return res.status(400).json({ error: 'The request could not be read. Please try again.' });
    }
    if (err?.type === 'encoding.unsupported') {
      return res.status(415).json({ error: 'That request format is not supported.' });
    }
    console.error(`[api] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

function startServer() {
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Adhyatmik Bharat API listening on http://localhost:${config.port}`);
    console.log(`Payment mode: ${config.paymentDevMode ? 'simulated (dev)' : 'live'}`);
    console.log(`DB pool: ${config.db.poolSize} connections · proxy trust: ${config.trustProxy}`);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const stopReminders = startReminderScheduler();
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[api] ${signal} received — draining connections`);
    stopReminders();
    server.close(async () => {
      try {
        await pool.end();
      } catch (err) {
        console.error('[api] pool shutdown failed', err.message);
      }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (cluster.isPrimary && config.webConcurrency > 1) {
  console.log(`[api] primary ${process.pid} starting ${config.webConcurrency} workers`);
  let shuttingDown = false;

  for (let i = 0; i < config.webConcurrency; i += 1) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    console.error(`[api] worker ${worker.process.pid} exited (${signal || code}) — restarting`);
    cluster.fork();
  });

  const stopWorkers = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const worker of Object.values(cluster.workers || {})) {
      worker?.process.kill(signal);
    }
    setTimeout(() => process.exit(0), 16_000).unref();
  };

  process.on('SIGTERM', () => stopWorkers('SIGTERM'));
  process.on('SIGINT', () => stopWorkers('SIGINT'));
} else {
  startServer();
}
