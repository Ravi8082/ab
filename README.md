# Adhyatmik Bharat — Event Website

A premium, immersive event website for "Adhyatmik Bharat" featuring 3D animations,
smooth scroll, user registration with payments, and a protected admin panel.

## Events
- **Mahi Sundarkand** — 10 cities across 10 states, 1,000 devotees per city
- **Adhyatmik Bharat Expo** — 3-day exposition at Pragati Maidan, Delhi (27–29 Aug 2027)

## Tech Stack
- React + Vite + TypeScript + Tailwind CSS
- Framer Motion (animation), Lenis (smooth scroll)
- Three.js + React Three Fiber (3D scenes)
- Supabase (Postgres, Auth, RLS, Edge Functions)
- Razorpay (payments), jsPDF + QRCode (tickets)

## Setup

1. Install dependencies:
   ```
   npm install --legacy-peer-deps
   ```

2. Environment variables (already configured in `.env`):
   - `VITE_SUPABASE_URL` — Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon key
   - `VITE_RAZORPAY_KEY_ID` — Razorpay key ID (optional in dev)

3. Admin access:
   - Navigate to `/admin`
   - Sign in with an admin email/password
   - The user must be added to the `admin_roles` table

## Admin Panel
- Dashboard with booking stats, revenue, city capacity
- Manage events, ticket types, cities, coupons
- View/search/filter bookings, export CSV
- QR code check-in scanner

## Public Site
- Hero with 3D glowing diya and ember particles
- Mahi Sundarkand: 3D city ring, tilt cards with pricing
- Expo: 3D yajna kund, Rajsuya Yagya card, benefit tier cards
- Registration modal with Razorpay payment
- Confirmation page with downloadable PDF ticket (QR code)
- My Booking lookup by phone or booking ID
- EN / हिंदी language toggle, dark/light theme
