# Adhyatmik Bharat

Event website and operations platform for **Adhyatmik Bharat** — a React single-page
site backed by an Express + MySQL API, with paid pass booking, QR gate check-in,
staff verification and a full admin panel.

- **Mahi Sundarkand** — touring event across 10 cities / 10 states, 1,000 devotees per city
- **Adhyatmik Bharat Expo** — 3-day exposition at Pragati Maidan, Delhi (27–29 Aug 2027)

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Framer Motion, Lenis |
| 3D | Three.js + React Three Fiber / drei |
| Backend | Node.js (ESM), Express 4, MySQL 8 (`mysql2`), Zod |
| Auth | httpOnly cookie / bearer JWT, bcrypt password hashes |
| Payments | Razorpay orders + signed webhook (dev simulation available) |
| Email | Nodemailer + SMTP (Gmail App Password), PDF passes via jsPDF + QRCode |
| Ops | PM2 process file, nginx example config, mysqldump backups, Node test runner |

There is **no Supabase dependency** — all data, auth, OTPs, bookings, scans, email
logs and audit trails live in MySQL and are served by `server/`.

## Repository layout

```
src/                React app (public site, /admin, /staff)
server/             Express API, routes, lib, DB scripts, tests
server/scripts/     setup-db.js (migrations), seed.js (first run only), backup-db.js, clear-demo-entries.js
deploy/             PM2 ecosystem file + nginx site example
public/             static assets, og-cover.png, robots.txt, sitemap.xml
index.html          meta / Open Graph / JSON-LD
```

## Getting started

Requirements: Node.js 20+ (tested on 24), MySQL 8.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the environment file and fill it in:
   ```bash
   cp .env.example .env
   ```
   `.env` is gitignored and **must never be committed**. At minimum set `DB_*`,
   `JWT_SECRET` (48 random bytes), and `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the
   first-run account.
3. Create the schema and seed the initial admin:
   ```bash
   node server/scripts/setup-db.js
   ```
   `server/scripts/seed.js` creates demo events/cities and is only meant for a
   fresh development database — do **not** run it against production data.
4. Run the app (two terminals):
   ```bash
   npm run dev       # Vite on http://localhost:5173
   npm run api:dev   # API on http://localhost:4000 (node --watch)
   ```
   Vite proxies `/api` to the API server.

### Environment variables

See [.env.example](.env.example) for the full annotated list. Groups:

- **Database** — `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- **Server** — `API_PORT`, `PUBLIC_SITE_URL`, `JWT_SECRET`, `TRUST_PROXY`,
  `DB_POOL_SIZE`, `WEB_CONCURRENCY`, `PAGE_CACHE_MS`
- **Reminders** — `REMINDERS_ENABLED`, `REMINDER_INTERVAL_MS`
- **First-run admin** — `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`
- **Modes** — `OTP_DEV_MODE`, `PAYMENT_DEV_MODE` (keep `true` locally; set both
  `false` when OTP delivery and Razorpay are live)
- **Email** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `SMTP_FROM`, `SUPPORT_EMAIL`. Gmail requires a Google **App Password**; never
  the account password.
- **Social** — `SOCIAL_INSTAGRAM`, `SOCIAL_FACEBOOK`, `SOCIAL_YOUTUBE`,
  `SOCIAL_LINKEDIN`. Blank/placeholder values that point back at the event site
  are ignored in emails and PDFs.
- **Razorpay** — `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run api:dev` | API with `--watch` |
| `npm run api` | API without watch |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | API unit tests (`server/tests/*.test.mjs`) |
| `npm run backup` | Compress a MySQL dump into `backups/` |
| `node server/scripts/setup-db.js` | Apply schema migrations |
| `node server/scripts/clear-demo-entries.js` | Count test scans; add `--yes` to back up to `backups/` and reset all gate entries |

## Public site

- Landing page with 3D diya, city ring, expo yajna visuals, bilingual EN/हिंदी toggle
- Ticket cards with date slabs, offer/actual pricing and coupon box
- Booking drawer: lead devotee + per-person details for group passes, T&C consent
- Razorpay checkout (or simulated payment in dev), confirmation page with PDF pass
- Booking lookup / amendment requests and waitlist flow for states without an event
- Legal pages (terms, privacy, refund), cookie consent, robots.txt / sitemap.xml

## Admin panel (`/admin`)

Sections: Dashboard, Events, Schedules, Locations, Coupons, Bookings, Sales,
Emails, Audit log, Staff, Check-in, Content, Account.

- **Bookings** — search/filter, CSV export, issue free passes, resend a pass email
  with the original PDF, cancel with policy-aware refund allocation, amend
  quantity/city/date/ticket type (upgrade reissues the pass, downgrade requires refund)
- **Check-in** — per-day QR scans, gate binding, duplicate-gate alerts, entry blocklist
- **Staff** — KYC documents, OTP verification, block/update/delete
- **Emails** — every outbound mail is logged (kind, recipient, status, reference)
- **Audit log** — filterable trail of admin/system/public actions with metadata
- **Locations** — waitlist roster with CSV export and bulk email to verified contacts
- **Account** — change your own admin password (requires current password)
- Coupons, date-wise price slabs, event/city capacity and site content are all
  editable here; nothing is hard-coded.

## Staff gate app (`/staff`)

Staff sign in with their registered mobile + OTP, then scan rotating single-use
pass QR codes. The scanner resolves the booking, shows visitor/VIP identity and
group seats, enforces the blocklist, pass validity window and per-day usage, and
records the gate for duplicate-entry alerts. Results appear as a modal with
clear pass/reject states.

When the venue internet drops, the scanner falls back to a gate list cached on the
device (refreshed every few minutes while online). Printed pass QR codes and `AB26`
references are checked locally against the same rules, queued on the device, and
synced automatically once the connection returns. Rotating live QR codes need the
server and are refused offline — staff are told to ask for the printed pass.

## Cancellations, refunds and changes

- Cancellation honours the published refund policy and allocates the refund across
  captured payments (newest first) in `event_payments`.
- Refunds must be completed in the Razorpay dashboard; the admin action records the
  refund and updates the booking to `refunded`.
- Upgrades/date changes collect any price difference, reissue the PDF pass and store
  the change in the audit log. Downgrades that owe money are routed to refund first.

## Emails and PDF passes

Booking emails attach the PDF pass with QR, event/city details, devotee names,
support contact and real social links only. Every send is persisted in `email_log`;
cancellations, refunds and waitlist broadcasts use `kind='notice'`. If SMTP is not
configured, messages are logged in dev mode instead of failing the booking.

## Backups and restore

`npm run backup` writes a gzip-compressed `mysqldump` into `backups/` (gitignored),
keeps the newest `BACKUP_KEEP` files (default 14), and passes the password via
`MYSQL_PWD` so it never appears in the process list. Options: `BACKUP_DIR`,
`BACKUP_KEEP`, `MYSQLDUMP_PATH`.

Suggested cron (daily 02:30):

```
30 2 * * * cd /var/www/adhyatmik && /usr/bin/npm run backup >> logs/backup.log 2>&1
```

Restore:

```bash
gunzip -c backups/ar-<stamp>.sql.gz | mysql -h 127.0.0.1 -u <user> -p <db>
```

Test a restore into a scratch database before relying on it.

## Deployment

1. Build the frontend: `npm run build`
2. Start the API with PM2:
   ```bash
   pm2 start deploy/ecosystem.config.cjs --env production
   pm2 save
   ```
3. Configure nginx from [deploy/nginx.conf.example](deploy/nginx.conf.example):
   TLS, `www` redirect, SPA fallback, `/api/` proxy to `127.0.0.1:4000`, static
   asset caching and a 10 MB body limit for KYC uploads.
4. Set `PUBLIC_SITE_URL` to the real HTTPS origin, `TRUST_PROXY=1`, and
   `OTP_DEV_MODE` / `PAYMENT_DEV_MODE` to `false`.
5. Configure the Razorpay webhook to
   `https://<domain>/api/payments/razorpay/webhook` (events `payment.captured`,
   `order.paid`) and put the signing secret in `RAZORPAY_WEBHOOK_SECRET`.

Health check: `GET /api/health`. Logs: `logs/api-out.log` / `logs/api-error.log`
via PM2 (`pm2 logs adhyatmik-api`, `pm2 monit`). Point your uptime monitor at the
health endpoint and alert on non-200 responses.

## Tests

```bash
npm test
```

Covers reference/QR generation, coupon normalisation and discount maths, date-slab
pricing, social-link placeholder filtering, and the security helpers (password
policy, CSV formula-injection escaping, upload file-signature checks). Tests set
their own env values and do not require SMTP, payments or a database.

## Security notes

- Credentials live only in the gitignored `.env`; never commit or print secrets,
  OTPs, tokens or passwords.
- Passwords are stored as bcrypt hashes (cost 12); OTPs are hashed too (cost 10)
  and never logged. OTPs and QR codes come from `crypto.randomInt` /
  `randomBytes`, never `Math.random`.
- Admin passwords need 10+ characters with upper case, lower case and a number,
  and common guesses are rejected. Changing a password invalidates every other
  session: `admins.token_version` is bumped and each JWT carries a `ver` claim
  that `requireAdmin` compares against the database. Disabling or resetting a
  staff account revokes that account's session the same way.
- The session lives in an `httpOnly`, `SameSite=Lax` cookie — `__Host-ab_admin`
  in production (so no other site can set it) and `ab_admin` locally. The login
  response never includes the JWT, so page JavaScript cannot read it.
- Cookie-authenticated `POST`/`PATCH`/`DELETE` calls to `/api/admin` and
  `/api/staff` must carry an `Origin`/`Referer` that matches this server or the
  allowlisted site origins; anything else is refused with 403. Bearer-token
  clients (the offline gate pack) are exempt because they send no ambient cookie.
- Helmet serves a strict CSP: `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, no inline script or event-handler attributes. The two
  JSON-LD blocks in the built `index.html` are allowed by hashes computed at
  startup, and only Razorpay's checkout origins are opened up. `/api/admin` and
  `/api/staff` responses are marked `no-store`.
- CORS accepts only `PUBLIC_SITE_URL`, `CORS_ORIGINS` and (outside production)
  the local dev ports; unknown origins get no `Access-Control-Allow-Origin`.
- Rate limits: 1200 requests/minute per IP across all `/api`, tighter per-route
  limits on login, OTP, gate scan and bulk-email endpoints. The gate staff API
  keys limits per account, not just per IP.
- `TRUST_PROXY` defaults to *no* proxy trust. Set it to the real hop count
  (`1` behind nginx) — otherwise audit-log IPs and rate limits read a
  spoofable `X-Forwarded-For`.
- With `NODE_ENV=production` the API refuses to start while `OTP_DEV_MODE` or
  `PAYMENT_DEV_MODE` is still `true`, and while `JWT_SECRET` is short or the
  example value. Startup logs warn about missing Razorpay/SMTP config, `root`
  database user and a non-HTTPS `PUBLIC_SITE_URL`.
- KYC uploads: the 6 MB body limit applies only to the KYC upload routes (every
  other JSON body is capped at 256 KB), the base64 length is checked before
  decoding, and the file type is taken from the file's own bytes — JPG, PNG,
  WEBP or PDF signatures only, so SVG or script-bearing uploads are refused.
  Files are stored under `server/uploads/staff-kyc/<adminId>/` outside the
  web root, path-resolved and containment-checked. Downloads are audited,
  `no-store`, `nosniff`, sandboxed and forced to `attachment`.
- CSV exports escape quotes and prefix any cell starting with `= + - @`, tab or
  carriage return, so a visitor-supplied name cannot become a formula in Excel.
- Login checks the password before the account status and hashes a dummy value
  when the email is unknown, so response content and timing do not reveal
  whether an account exists. Failed attempts lock the account for 15 minutes.
- Admin/staff permissions, rate limits, OTP checks, payment signatures and QR
  check-in are enforced server-side — hiding UI is not access control.
- Local MySQL `root`/`root` is development-only. Create a dedicated least-privilege
  user before go-live and grant only what the app needs.
- Errors return generic messages; stack traces stay in server logs. Malformed
  JSON is a 400 and an unsupported request encoding a 415.

## Before go-live

- [ ] Dedicated MySQL user with a strong password (not `root`)
- [ ] `JWT_SECRET` rotated to a long random value; `PUBLIC_SITE_URL` set to HTTPS domain
- [ ] `TRUST_PROXY` matches the real proxy hop count (`1` behind nginx, `false` if exposed directly)
- [ ] `CORS_ORIGINS` lists only the real browser origins, if any beyond `PUBLIC_SITE_URL`
- [ ] `OTP_DEV_MODE=false`, `PAYMENT_DEV_MODE=false`
- [ ] Razorpay live keys + webhook secret configured and test payment verified
- [ ] Razorpay checkout verified against the CSP (pay once in production mode)
- [ ] SMTP App Password verified; send a test booking email
- [ ] Real social profile URLs filled in (or left blank)
- [ ] SSL installed, `www` redirect and SPA fallback verified
- [ ] Backup cron running and a restore tested
- [ ] Uptime monitor on `/api/health`
- [ ] Admin owner password rotated; staff accounts KYC-verified
