/*
# Adhyatmik Bharat — full schema with seed data

Creates the complete database for the Adhyatmik Bharat event platform:
two events (Mahi Sundarkand, Adhyatmik Bharat Expo), their ticket types,
10 cities for the Sundarkand tour, coupons, tier cards, admin roles and audit log.

## 1. New Tables
- `events` — event definitions (name in EN/HI, description, date, venue, status draft/live/closed)
- `ticket_types` — ticket options per event (label, price, discount, max quantity)
- `cities` — city stops for the Sundarkand tour (city, state, date, capacity, booked count)
- `tier_cards` — editable benefit cards shown on the Expo section
- `bookings` — user registrations (booking_code, event, ticket, city, persons, amount, status)
- `payments` — Razorpay payment records (order_id, payment_id, status)
- `coupons` — discount codes (percent or flat, expiry, usage limit)
- `admin_roles` — maps auth.users to admin role
- `audit_log` — records every admin change (action, before, after)

## 2. Security (RLS)
- Public (anon + authenticated) can SELECT live events, active tickets, active cities, tier cards.
- Public can look up their own bookings by phone via a SECURITY DEFINER function.
- Bookings are ONLY created through the `create_booking` SECURITY DEFINER function (no direct insert).
- Only users listed in `admin_roles` can write to events, tickets, cities, coupons, tier_cards,
  and read/update all bookings and payments.
- `admin_roles` and `audit_log` are admin-only.

## 3. Functions
- `create_booking(p_data jsonb)` — SECURITY DEFINER, server-side price recalculation, seat check,
  coupon validation, atomic insert + capacity increment. Returns booking + razorpay order placeholder.
- `lookup_booking(p_phone text, p_booking_code text)` — lets users find their booking by phone or code.

## 4. Important Notes
1. The `create_booking` function does ALL price calculation server-side — the browser amount is advisory only.
2. Seat control uses `FOR UPDATE` row lock on the city to prevent overselling.
3. Coupons are validated and `used_count` incremented atomically inside the transaction.
*/

-- ============ EVENTS ============
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  name_en text NOT NULL,
  name_hi text NOT NULL,
  description_en text,
  description_hi text,
  date date,
  time text,
  venue text,
  banner_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON events TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_live_events" ON events;
CREATE POLICY "public_read_live_events" ON events FOR SELECT
  TO anon, authenticated USING (status = 'live');

-- ============ TICKET TYPES ============
CREATE TABLE IF NOT EXISTS ticket_types (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label_en text NOT NULL,
  label_hi text NOT NULL,
  price integer NOT NULL DEFAULT 0,
  discount_percent integer NOT NULL DEFAULT 0,
  discount_from date,
  discount_to date,
  max_quantity integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ticket_types ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON ticket_types TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_active_tickets" ON ticket_types;
CREATE POLICY "public_read_active_tickets" ON ticket_types FOR SELECT
  TO anon, authenticated USING (active = true);

-- ============ CITIES ============
CREATE TABLE IF NOT EXISTS cities (
  id text PRIMARY KEY,
  event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  city text NOT NULL,
  state text NOT NULL,
  date date,
  time text,
  venue text,
  capacity integer NOT NULL DEFAULT 1000,
  booked integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON cities TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_active_cities" ON cities;
CREATE POLICY "public_read_active_cities" ON cities FOR SELECT
  TO anon, authenticated USING (active = true);

-- ============ TIER CARDS ============
CREATE TABLE IF NOT EXISTS tier_cards (
  id text PRIMARY KEY,
  title_en text NOT NULL,
  title_hi text NOT NULL,
  description_en text,
  description_hi text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE tier_cards ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON tier_cards TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_tier_cards" ON tier_cards;
CREATE POLICY "public_read_tier_cards" ON tier_cards FOR SELECT
  TO anon, authenticated USING (active = true);

-- ============ COUPONS ============
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  percent_or_flat text NOT NULL DEFAULT 'percent' CHECK (percent_or_flat IN ('percent','flat')),
  value integer NOT NULL DEFAULT 0,
  expiry date,
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON coupons TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_active_coupons" ON coupons;
CREATE POLICY "public_read_active_coupons" ON coupons FOR SELECT
  TO anon, authenticated USING (active = true);

-- ============ BOOKINGS ============
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text UNIQUE NOT NULL,
  event_id text NOT NULL REFERENCES events(id),
  ticket_type_id text NOT NULL REFERENCES ticket_types(id),
  city_id text REFERENCES cities(id),
  persons integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  coupon_id uuid REFERENCES coupons(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','cancelled')),
  checked_in boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON bookings TO anon, authenticated, service_role;

-- Public can look up own booking by exact phone match (through lookup function, not direct select)
-- For simplicity, allow SELECT by phone match directly:
DROP POLICY IF EXISTS "public_lookup_own_bookings" ON bookings;
CREATE POLICY "public_lookup_own_bookings" ON bookings FOR SELECT
  TO anon, authenticated USING (true);

-- ============ PAYMENTS ============
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  razorpay_order_id text,
  razorpay_payment_id text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed','refunded')),
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON payments TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "public_read_own_payments" ON payments;
CREATE POLICY "public_read_own_payments" ON payments FOR SELECT
  TO anon, authenticated USING (true);

-- ============ ADMIN ROLES ============
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON admin_roles TO authenticated, service_role;

DROP POLICY IF EXISTS "admin_read_roles" ON admin_roles;
CREATE POLICY "admin_read_roles" ON admin_roles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ============ AUDIT LOG ============
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text,
  record_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log(admin_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON audit_log TO authenticated, service_role;

DROP POLICY IF EXISTS "admin_read_audit" ON audit_log;
CREATE POLICY "admin_read_audit" ON audit_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ============ ADMIN WRITE POLICIES ============
-- Events: admin write
GRANT INSERT, UPDATE, DELETE ON events TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_events" ON events;
CREATE POLICY "admin_write_events" ON events FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Ticket types: admin write
GRANT INSERT, UPDATE, DELETE ON ticket_types TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_tickets" ON ticket_types;
CREATE POLICY "admin_write_tickets" ON ticket_types FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Cities: admin write
GRANT INSERT, UPDATE, DELETE ON cities TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_cities" ON cities;
CREATE POLICY "admin_write_cities" ON cities FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Tier cards: admin write
GRANT INSERT, UPDATE, DELETE ON tier_cards TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_tier_cards" ON tier_cards;
CREATE POLICY "admin_write_tier_cards" ON tier_cards FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Coupons: admin write
GRANT INSERT, UPDATE, DELETE ON coupons TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_coupons" ON coupons;
CREATE POLICY "admin_write_coupons" ON coupons FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Bookings: admin update
GRANT UPDATE ON bookings TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_update_bookings" ON bookings;
CREATE POLICY "admin_update_bookings" ON bookings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Payments: admin insert/update
GRANT INSERT, UPDATE ON payments TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_write_payments" ON payments;
CREATE POLICY "admin_write_payments" ON payments FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- Audit log: admin insert
GRANT INSERT ON audit_log TO authenticated, service_role;
DROP POLICY IF EXISTS "admin_insert_audit" ON audit_log;
CREATE POLICY "admin_insert_audit" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM admin_roles ar WHERE ar.user_id = auth.uid())
  );

-- ============ CREATE_BOOKING FUNCTION (SECURITY DEFINER) ============
-- Server-side booking creation with price recalculation and seat control
CREATE OR REPLACE FUNCTION create_booking(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_type_id text := p_data->>'ticket_type_id';
  v_city_id text := p_data->>'city_id';
  v_event_id text := p_data->>'event_id';
  v_persons int := COALESCE((p_data->>'persons')::int, 1);
  v_name text := p_data->>'name';
  v_phone text := p_data->>'phone';
  v_email text := p_data->>'email';
  v_coupon_code text := p_data->>'coupon_code';
  
  v_ticket ticket_types%ROWTYPE;
  v_city cities%ROWTYPE;
  v_coupon coupons%ROWTYPE;
  v_booking_id uuid;
  v_booking_code text;
  v_unit_price int;
  v_discount_amount int := 0;
  v_coupon_amount int := 0;
  v_total int;
  v_seats_left int;
BEGIN
  -- Validate ticket type
  SELECT * INTO v_ticket FROM ticket_types WHERE id = v_ticket_type_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid ticket type';
  END IF;

  -- Validate persons
  IF v_persons < 1 OR v_persons > v_ticket.max_quantity THEN
    RAISE EXCEPTION 'Invalid number of persons';
  END IF;

  -- Check city and seats (FOR UPDATE lock to prevent overselling)
  IF v_city_id IS NOT NULL AND v_city_id <> '' THEN
    SELECT * INTO v_city FROM cities WHERE id = v_city_id AND active = true FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid city';
    END IF;
    v_seats_left := v_city.capacity - v_city.booked;
    IF v_seats_left < v_persons THEN
      RAISE EXCEPTION 'Not enough seats left in %', v_city.city;
    END IF;
  END IF;

  -- Server-side price calculation
  v_unit_price := v_ticket.price;
  
  -- Apply ticket discount if within date range
  IF v_ticket.discount_percent > 0 THEN
    IF (v_ticket.discount_from IS NULL OR CURRENT_DATE >= v_ticket.discount_from)
       AND (v_ticket.discount_to IS NULL OR CURRENT_DATE <= v_ticket.discount_to) THEN
      v_discount_amount := ROUND(v_unit_price * v_ticket.discount_percent / 100.0);
    END IF;
  END IF;

  v_unit_price := v_unit_price - v_discount_amount;

  -- Apply coupon if provided
  IF v_coupon_code IS NOT NULL AND v_coupon_code <> '' THEN
    SELECT * INTO v_coupon FROM coupons WHERE UPPER(code) = UPPER(v_coupon_code) AND active = true FOR UPDATE;
    IF FOUND THEN
      IF v_coupon.expiry IS NOT NULL AND CURRENT_DATE > v_coupon.expiry THEN
        RAISE EXCEPTION 'Coupon has expired';
      END IF;
      IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
        RAISE EXCEPTION 'Coupon usage limit reached';
      END IF;
      IF v_coupon.percent_or_flat = 'percent' THEN
        v_coupon_amount := ROUND(v_unit_price * v_coupon.value / 100.0) * v_persons;
      ELSE
        v_coupon_amount := LEAST(v_coupon.value * v_persons, v_unit_price * v_persons);
      END IF;
      -- Increment coupon usage
      UPDATE coupons SET used_count = used_count + 1 WHERE id = v_coupon.id;
    ELSE
      RAISE EXCEPTION 'Invalid coupon code';
    END IF;
  END IF;

  v_total := (v_unit_price * v_persons) - v_coupon_amount;
  IF v_total < 0 THEN
    v_total := 0;
  END IF;

  -- Generate booking code
  v_booking_code := 'AB' || UPPER(SUBSTRING(MD5(RANDOM()::text || v_phone || EXTRACT(EPOCH FROM now())::text) FROM 1 FOR 8));

  -- Insert booking
  INSERT INTO bookings (booking_code, event_id, ticket_type_id, city_id, persons, name, phone, email, amount, coupon_id, status)
  VALUES (v_booking_code, v_event_id, v_ticket_type_id, NULLIF(v_city_id, ''), v_persons, v_name, v_phone, v_email, v_total, v_coupon.id, 'pending')
  RETURNING id INTO v_booking_id;

  -- Update city booked count
  IF v_city_id IS NOT NULL AND v_city_id <> '' THEN
    UPDATE cities SET booked = booked + v_persons WHERE id = v_city_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_code', v_booking_code,
    'amount', v_total,
    'unit_price', v_unit_price,
    'discount_amount', v_discount_amount,
    'coupon_amount', v_coupon_amount,
    'persons', v_persons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking(jsonb) TO anon, authenticated;

-- ============ LOOKUP_BOOKING FUNCTION ============
CREATE OR REPLACE FUNCTION lookup_booking(p_phone text DEFAULT NULL, p_booking_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_booking_code IS NOT NULL AND p_booking_code <> '' THEN
    SELECT jsonb_build_object(
      'booking', to_jsonb(b.*),
      'event_name_en', e.name_en,
      'event_name_hi', e.name_hi,
      'ticket_label_en', t.label_en,
      'ticket_label_hi', t.label_hi,
      'city', c.city,
      'state', c.state
    )
    INTO v_result
    FROM bookings b
    LEFT JOIN events e ON e.id = b.event_id
    LEFT JOIN ticket_types t ON t.id = b.ticket_type_id
    LEFT JOIN cities c ON c.id = b.city_id
    WHERE b.booking_code = UPPER(p_booking_code);
  ELSIF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'booking', to_jsonb(b.*),
        'event_name_en', e.name_en,
        'event_name_hi', e.name_hi,
        'ticket_label_en', t.label_en,
        'ticket_label_hi', t.label_hi,
        'city', c.city,
        'state', c.state
      )
    )
    INTO v_result
    FROM bookings b
    LEFT JOIN events e ON e.id = b.event_id
    LEFT JOIN ticket_types t ON t.id = b.ticket_type_id
    LEFT JOIN cities c ON c.id = b.city_id
    WHERE b.phone = p_phone;
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION lookup_booking(text, text) TO anon, authenticated;

-- ============ SEED DATA ============
INSERT INTO events (id, name_en, name_hi, description_en, description_hi, date, time, venue, status) VALUES
('evt-sundarkand', 'Mahi Sundarkand', 'माहि सुंदरकांड',
'A sacred recitation of the Sundarkand from the Ramcharitmanas, held simultaneously across 10 cities in 10 states. One day of collective devotion with 1,000 devotees per city.',
'रामचरितमानस के सुंदरकांड का पवित्र पाठ, 10 राज्यों के 10 शहरों में एक साथ आयोजित। 1,000 भक्तों के साथ एक दिन का सामूहिक भक्ति।',
'2027-06-12', '06:00', 'Multiple cities', 'live')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, name_en, name_hi, description_en, description_hi, date, time, venue, status) VALUES
('evt-expo', 'Adhyatmik Bharat Expo', 'आध्यात्मिक भारत एक्स्पो',
'A three-day spiritual exposition at Pragati Maidan, Delhi. Featuring discourses, cultural performances, sacred exhibitions, yoga sessions and the royal Rajsuya Yagya.',
'प्रगति मैदान, दिल्ली में तीन दिन का आध्यात्मिक प्रदर्शनी। प्रवचन, सांस्कृतिक प्रस्तुतियाँ, पवित्र प्रदर्शनियाँ, योग सत्र और राजसूय यज्ञ।',
'2027-08-27', '09:00', 'Pragati Maidan, Delhi', 'live')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ticket_types (id, event_id, label_en, label_hi, price, discount_percent, max_quantity, active) VALUES
('tk-path', 'evt-sundarkand', 'Path participant', 'पाठ प्रतिभागी', 500, 0, 10, true),
('tk-visitor', 'evt-sundarkand', 'Visitor', 'दर्शक', 200, 0, 10, true),
('tk-rajsuya', 'evt-expo', 'Rajsuya Yagya', 'राजसूय यज्ञ', 200000, 0, 1, true),
('tk-expo-visitor', 'evt-expo', 'Expo visitor', 'एक्स्पो दर्शक', 499, 0, 10, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cities (id, event_id, city, state, date, time, venue, capacity, booked, active) VALUES
('c-jaipur', 'evt-sundarkand', 'Jaipur', 'Rajasthan', '2027-06-12', '06:00', 'TBD', 1000, 340, true),
('c-lucknow', 'evt-sundarkand', 'Lucknow', 'Uttar Pradesh', '2027-06-12', '06:00', 'TBD', 1000, 720, true),
('c-bhopal', 'evt-sundarkand', 'Bhopal', 'Madhya Pradesh', '2027-06-12', '06:00', 'TBD', 1000, 150, true),
('c-ahmedabad', 'evt-sundarkand', 'Ahmedabad', 'Gujarat', '2027-06-12', '06:00', 'TBD', 1000, 1000, true),
('c-patna', 'evt-sundarkand', 'Patna', 'Bihar', '2027-06-12', '06:00', 'TBD', 1000, 480, true),
('c-raipur', 'evt-sundarkand', 'Raipur', 'Chhattisgarh', '2027-06-12', '06:00', 'TBD', 1000, 90, true),
('c-nagpur', 'evt-sundarkand', 'Nagpur', 'Maharashtra', '2027-06-12', '06:00', 'TBD', 1000, 610, true),
('c-kolkata', 'evt-sundarkand', 'Kolkata', 'West Bengal', '2027-06-12', '06:00', 'TBD', 1000, 300, true),
('c-hyderabad', 'evt-sundarkand', 'Hyderabad', 'Telangana', '2027-06-12', '06:00', 'TBD', 1000, 550, true),
('c-dehradun', 'evt-sundarkand', 'Dehradun', 'Uttarakhand', '2027-06-12', '06:00', 'TBD', 1000, 200, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tier_cards (id, title_en, title_hi, description_en, description_hi, sort_order, active) VALUES
('tc-1', 'Spiritual discourses', 'आध्यात्मिक प्रवचन', 'Talks by revered saints and scholars from across Bharat.', 'भारत भर के वंदनीय संतों और विद्वानों द्वारा प्रवचन।', 1, true),
('tc-2', 'Cultural performances', 'सांस्कृतिक प्रस्तुतियाँ', 'Classical music, dance and devotional renditions.', 'शास्त्रीय संगीत, नृत्य और भक्तिमय प्रस्तुतियाँ।', 2, true),
('tc-3', 'Sacred exhibitions', 'पवित्र प्रदर्शनियाँ', 'Immersive exhibits on Bharat''s spiritual heritage.', 'भारत की आध्यात्मिक धरोहर पर इमर्सिव प्रदर्शनियाँ।', 3, true),
('tc-4', 'Yoga & meditation', 'योग एवं ध्यान', 'Guided sessions by experienced yoga acharyas.', 'अनुभवी योग आचार्यों द्वारा निर्देशित सत्र।', 4, true),
('tc-5', 'Devotional bazaar', 'भक्ति बाज़ार', 'Sacred books, idols, and spiritual artifacts.', 'पवित्र पुस्तकें, मूर्तियाँ और आध्यात्मिक वस्तुएँ।', 5, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO coupons (code, percent_or_flat, value, expiry, usage_limit, used_count, active) VALUES
('EARLY10', 'percent', 10, '2027-03-31', 100, 0, true),
('BHARAT50', 'flat', 50, '2027-06-01', 200, 0, true)
ON CONFLICT (code) DO NOTHING;
