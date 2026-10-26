import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cluster from 'node:cluster';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { publicRouter, razorpayWebhookHandler } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { staffRouter } from './routes/staff.js';
import { startReminderScheduler } from './lib/reminders.js';
import { HttpError } from './lib/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function createApp() {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const allowedOrigins = [
    config.siteUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];
  app.use(
    cors({
      origin: [...new Set(allowedOrigins)],
      credentials: true,
    }),
  );
  app.use(compression({ threshold: 1024 }));
  // Razorpay signs the exact raw body, so this route must run before express.json().
  app.post(
    '/api/payments/razorpay/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    razorpayWebhookHandler,
  );

  // Staff KYC documents are posted as base64 JSON, so this admin-only branch needs a larger body.
  app.use('/api/admin/staff', express.json({ limit: '8mb' }));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/api/admin', adminRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api', publicRouter);

  const distDir = path.join(here, '..', 'dist');
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
