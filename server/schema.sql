-- Adhyatmik Bharat Expo — stall booking schema (MySQL 8+)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(190) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL DEFAULT 'Admin',
  role            ENUM('owner','manager','staff') NOT NULL DEFAULT 'owner',
  active          TINYINT(1) NOT NULL DEFAULT 1,
  token_version   INT NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL,
  last_login_at   DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admin_otps (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT NOT NULL,
  purpose     VARCHAR(32) NOT NULL DEFAULT 'login',
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_admin (admin_id, purpose),
  CONSTRAINT fk_otp_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Gate staff identity proof. Admin-entered; the full numbers are never served outside /api/admin.
CREATE TABLE IF NOT EXISTS staff_kyc (
  admin_id           INT PRIMARY KEY,
  mobile             VARCHAR(20) NULL,
  mobile_verified_at DATETIME NULL,
  email_verified_at  DATETIME NULL,
  doc_type           ENUM('aadhaar','pan','voter_id','driving_licence','other') NOT NULL DEFAULT 'aadhaar',
  aadhaar_number     VARCHAR(20) NULL,
  pan_number         VARCHAR(16) NULL,
  other_doc_no       VARCHAR(60) NULL,
  aadhaar_photo      VARCHAR(255) NULL,
  pan_photo          VARCHAR(255) NULL,
  other_doc_photo    VARCHAR(255) NULL,
  status             ENUM('pending','otp_pending','docs_uploaded','verified','rejected') NOT NULL DEFAULT 'pending',
  verified_by        INT NULL,
  verified_at        DATETIME NULL,
  notes              VARCHAR(255) NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_kyc_status (status, updated_at),
  CONSTRAINT fk_kyc_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_kyc_otps (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT NOT NULL,
  purpose     ENUM('mobile','email') NOT NULL DEFAULT 'mobile',
  code_hash   VARCHAR(255) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_kycotp_admin (admin_id, purpose, consumed_at, expires_at),
  CONSTRAINT fk_kycotp_admin FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every block of the stall page is a row here, so the admin can edit it.
CREATE TABLE IF NOT EXISTS stall_sections (
  section_key VARCHAR(64) PRIMARY KEY,
  value_json  JSON NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stall_sectors (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name_en    VARCHAR(120) NOT NULL,
  name_hi    VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stall_packages (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  slug           VARCHAR(64) NOT NULL UNIQUE,
  name_en        VARCHAR(120) NOT NULL,
  name_hi        VARCHAR(160) NOT NULL,
  size_label     VARCHAR(60) NOT NULL,
  size_sqm       INT NOT NULL DEFAULT 0,
  slots_total    INT NOT NULL DEFAULT 20,
  price          INT NOT NULL,
  original_price INT NULL,
  inclusions     JSON NOT NULL,
  badge_en       VARCHAR(60) NULL,
  badge_hi       VARCHAR(80) NULL,
  availability   ENUM('available','limited','sold_out') NOT NULL DEFAULT 'available',
  featured       TINYINT(1) NOT NULL DEFAULT 0,
  sort_order     INT NOT NULL DEFAULT 0,
  active         TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stall_bookings (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  reference      VARCHAR(16) NOT NULL UNIQUE,
  package_id     INT NOT NULL,
  company        VARCHAR(190) NOT NULL,
  contact_name   VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  phone          VARCHAR(20) NOT NULL,
  gstin          VARCHAR(20) NULL,
  website        VARCHAR(190) NULL,
  sector_id      INT NULL,
  notes          VARCHAR(600) NULL,
  amount         INT NOT NULL,
  status         ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  qr_token       CHAR(32) NOT NULL UNIQUE,
  check_in_at    DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking_email (email),
  KEY idx_booking_phone (phone),
  KEY idx_booking_status (status),
  CONSTRAINT fk_booking_package FOREIGN KEY (package_id) REFERENCES stall_packages(id),
  CONSTRAINT fk_booking_sector FOREIGN KEY (sector_id) REFERENCES stall_sectors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS booking_otps (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_botp_booking (booking_id),
  CONSTRAINT fk_botp_booking FOREIGN KEY (booking_id) REFERENCES stall_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stall_payments (  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id   BIGINT NOT NULL,
  provider     ENUM('dev','razorpay') NOT NULL DEFAULT 'dev',
  provider_ref VARCHAR(120) NULL,
  amount       INT NOT NULL,
  status       ENUM('created','captured','failed','refunded') NOT NULL DEFAULT 'created',
  raw          JSON NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment_booking (booking_id),
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES stall_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('admin','system','public') NOT NULL,
  actor_id   INT NULL,
  action     VARCHAR(80) NOT NULL,
  entity     VARCHAR(60) NULL,
  entity_id  VARCHAR(60) NULL,
  meta       JSON NULL,
  ip         VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------
-- Event ticketing: Mahi Sundarkand yatra (10 cities) + Expo
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event_content (
  content_key VARCHAR(64) PRIMARY KEY,
  value_json  JSON NOT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_states (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(8) NOT NULL UNIQUE,
  name_en    VARCHAR(120) NOT NULL,
  name_hi    VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_cities (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  state_id   INT NOT NULL,
  name_en    VARCHAR(120) NOT NULL,
  name_hi    VARCHAR(160) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_city_state (state_id),
  CONSTRAINT fk_event_city_state FOREIGN KEY (state_id) REFERENCES event_states(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_venues (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  city_id    INT NOT NULL,
  name_en    VARCHAR(160) NOT NULL,
  name_hi    VARCHAR(200) NOT NULL,
  address_en VARCHAR(255) NOT NULL,
  address_hi VARCHAR(300) NOT NULL,
  map_url    VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_venue_city (city_id),
  CONSTRAINT fk_event_venue_city FOREIGN KEY (city_id) REFERENCES event_cities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_kinds (
  slug       VARCHAR(32) PRIMARY KEY,
  label_en   VARCHAR(60) NOT NULL,
  label_hi   VARCHAR(80) NOT NULL,
  layout     ENUM('route','single') NOT NULL DEFAULT 'route',
  sort_order INT NOT NULL DEFAULT 0,
  active     TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  slug           VARCHAR(64) NOT NULL UNIQUE,
  kind           VARCHAR(32) NOT NULL DEFAULT 'yatra',
  name_en        VARCHAR(160) NOT NULL,
  name_hi        VARCHAR(200) NOT NULL,
  tagline_en     VARCHAR(255) NOT NULL DEFAULT '',
  tagline_hi     VARCHAR(300) NOT NULL DEFAULT '',
  description_en TEXT NULL,
  description_hi TEXT NULL,
  date_label_en  VARCHAR(120) NOT NULL DEFAULT '',
  date_label_hi  VARCHAR(140) NOT NULL DEFAULT '',
  starts_on      DATE NULL,
  ends_on        DATE NULL,
  sale_ends_at   DATETIME NULL,
  active         TINYINT(1) NOT NULL DEFAULT 1,
  sort_order     INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_ticket_types (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  event_id       INT NOT NULL,
  slug           VARCHAR(64) NOT NULL,
  name_en        VARCHAR(120) NOT NULL,
  name_hi        VARCHAR(160) NOT NULL,
  description_en VARCHAR(400) NOT NULL DEFAULT '',
  description_hi VARCHAR(500) NOT NULL DEFAULT '',
  price          INT NOT NULL,
  original_price INT NULL,
  default_capacity INT NOT NULL DEFAULT 0,
  valid_days     INT NOT NULL DEFAULT 1,
  inclusions     JSON NOT NULL,
  badge_en       VARCHAR(60) NULL,
  badge_hi       VARCHAR(80) NULL,
  sort_order     INT NOT NULL DEFAULT 0,
  active         TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_ticket_slug (event_id, slug),
  CONSTRAINT fk_ticket_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_ticket_price_slabs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  ticket_type_id INT NOT NULL,
  effective_from DATE NOT NULL,
  price          INT NOT NULL,
  label_en       VARCHAR(80) NULL,
  label_hi       VARCHAR(100) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slab_ticket_date (ticket_type_id, effective_from),
  KEY idx_slab_ticket_effective (ticket_type_id, effective_from),
  CONSTRAINT fk_slab_ticket FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_schedules (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  event_id     INT NOT NULL,
  state_id     INT NOT NULL,
  city_id      INT NOT NULL,
  venue_id     INT NOT NULL,
  event_date   DATE NOT NULL,
  end_date     DATE NULL,
  start_time   TIME NULL,
  end_time     TIME NULL,
  sale_ends_at DATETIME NULL,
  note_en      VARCHAR(255) NULL,
  note_hi      VARCHAR(300) NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_schedule_venue_date (event_id, venue_id, event_date),
  KEY idx_schedule_date (event_date),
  KEY idx_schedule_state (state_id),
  KEY idx_schedule_city (city_id),
  KEY idx_schedule_venue (venue_id),
  CONSTRAINT fk_schedule_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_state FOREIGN KEY (state_id) REFERENCES event_states(id),
  CONSTRAINT fk_schedule_city FOREIGN KEY (city_id) REFERENCES event_cities(id),
  CONSTRAINT fk_schedule_venue FOREIGN KEY (venue_id) REFERENCES event_venues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_schedule_capacities (
  schedule_id   INT NOT NULL,
  ticket_type_id INT NOT NULL,
  capacity      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (schedule_id, ticket_type_id),
  CONSTRAINT fk_capacity_schedule FOREIGN KEY (schedule_id) REFERENCES event_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_capacity_ticket FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_state_waitlist (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  ref          VARCHAR(20) NOT NULL UNIQUE,
  state_id     INT NOT NULL,
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  phone        VARCHAR(20) NULL,
  status       ENUM('pending','verified') NOT NULL DEFAULT 'pending',
  verified_at  DATETIME NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_waitlist_state_email (state_id, email),
  KEY idx_waitlist_state (state_id),
  KEY idx_waitlist_status (status, created_at),
  CONSTRAINT fk_waitlist_state FOREIGN KEY (state_id) REFERENCES event_states(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_waitlist_otps (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  waitlist_id  BIGINT NOT NULL,
  code_hash    VARCHAR(100) NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  consumed_at  DATETIME NULL,
  expires_at   DATETIME NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_wotp_waitlist (waitlist_id, consumed_at, expires_at),
  CONSTRAINT fk_wotp_waitlist FOREIGN KEY (waitlist_id) REFERENCES event_state_waitlist(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_coupons (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(32) NOT NULL UNIQUE,
  kind           ENUM('percent','flat') NOT NULL DEFAULT 'percent',
  value          INT NOT NULL,
  event_id       INT NULL,
  ticket_type_id INT NULL,
  min_qty        INT NOT NULL DEFAULT 1,
  max_uses       INT NULL,
  per_email_limit INT NOT NULL DEFAULT 1,
  valid_from     DATE NULL,
  valid_until    DATE NULL,
  label_en       VARCHAR(120) NULL,
  label_hi       VARCHAR(160) NULL,
  active         TINYINT(1) NOT NULL DEFAULT 1,
  created_by     INT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_coupon_active (active, valid_until),
  CONSTRAINT fk_coupon_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_ticket FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_bookings (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  reference      VARCHAR(20) NOT NULL UNIQUE,
  event_id       INT NOT NULL,
  schedule_id    INT NOT NULL,
  ticket_type_id INT NOT NULL,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  phone          VARCHAR(20) NOT NULL,
  qty            INT NOT NULL DEFAULT 1,
  pass_days      INT NOT NULL DEFAULT 1,
  unit_price     INT NOT NULL,
  amount         INT NOT NULL,
  status         ENUM('pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
  source         ENUM('online','admin_free','admin_issued') NOT NULL DEFAULT 'online',
  guest_category ENUM('visitor','vip','press','organiser','staff','other') NOT NULL DEFAULT 'visitor',
  coupon_code    VARCHAR(32) NULL,
  discount_amount INT NOT NULL DEFAULT 0,
  gross_amount   INT NULL,
  issued_by      INT NULL,
  admin_note     VARCHAR(255) NULL,
  otp_verified_at DATETIME NULL,
  terms_accepted_at DATETIME NULL,
  qr_token       CHAR(32) NULL UNIQUE,
  pass_sent_at   DATETIME NULL,
  check_in_at    DATETIME NULL,
  checked_in_by  INT NULL,
  cancelled_at   DATETIME NULL,
  cancelled_by   INT NULL,
  cancel_reason  VARCHAR(255) NULL,
  refund_amount  INT NULL,
  refund_reference VARCHAR(120) NULL,
  refunded_at    DATETIME NULL,
  refunded_by    INT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_event_booking_email (email),
  KEY idx_event_booking_phone (phone),
  KEY idx_event_booking_status (status),
  KEY idx_event_booking_status_created (status, created_at),
  KEY idx_event_booking_sold (schedule_id, ticket_type_id, status),
  KEY idx_event_booking_schedule (schedule_id),
  KEY idx_event_booking_event (event_id),
  KEY idx_event_booking_coupon (coupon_code),
  CONSTRAINT fk_eb_event FOREIGN KEY (event_id) REFERENCES events(id),
  CONSTRAINT fk_eb_schedule FOREIGN KEY (schedule_id) REFERENCES event_schedules(id),
  CONSTRAINT fk_eb_ticket FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id),
  CONSTRAINT fk_eb_issuer FOREIGN KEY (issued_by) REFERENCES admins(id) ON DELETE SET NULL,
  CONSTRAINT fk_eb_canceller FOREIGN KEY (cancelled_by) REFERENCES admins(id) ON DELETE SET NULL,
  CONSTRAINT fk_eb_refunder FOREIGN KEY (refunded_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_coupon_uses (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  coupon_id  INT NOT NULL,
  booking_id BIGINT NOT NULL UNIQUE,
  email      VARCHAR(190) NOT NULL,
  amount_off INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_coupon_use (coupon_id, created_at),
  KEY idx_coupon_use_email (coupon_id, email),
  CONSTRAINT fk_cuse_coupon FOREIGN KEY (coupon_id) REFERENCES event_coupons(id) ON DELETE CASCADE,
  CONSTRAINT fk_cuse_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_booking_otps (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eotp_booking (booking_id),
  CONSTRAINT fk_eotp_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per person admitted. A booking with qty 5 collects up to five rows on the same
-- entry_date, so the (booking_id, entry_date) index is deliberately not unique.
CREATE TABLE IF NOT EXISTS event_booking_checkins (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id    BIGINT NOT NULL,
  entry_date    DATE NOT NULL,
  checked_in_by INT NULL,
  gate          VARCHAR(60) NULL,
  -- Set for scans queued by the offline gate scanner, so replaying a queue cannot double-admit.
  client_scan_id VARCHAR(64) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkin_client_scan (client_scan_id),
  KEY idx_checkin_booking_day (booking_id, entry_date),
  KEY idx_checkin_day (entry_date),
  KEY idx_checkin_staff (checked_in_by),
  CONSTRAINT fk_checkin_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rejected gate scans. A copied QR that someone else carries to another gate shows up here,
-- so the admin can see which gate tried it and when instead of only seeing the accepted entry.
CREATE TABLE IF NOT EXISTS event_scan_denials (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT NULL,
  reference  VARCHAR(20) NULL,
  code_hint  VARCHAR(24) NULL,
  reason     VARCHAR(32) NOT NULL,
  gate       VARCHAR(60) NULL,
  other_gate TINYINT(1) NOT NULL DEFAULT 0,
  entry_date DATE NULL,
  staff_id   INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_denial_booking (booking_id, created_at),
  KEY idx_denial_day (entry_date),
  CONSTRAINT fk_denial_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_denial_staff FOREIGN KEY (staff_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Short-lived pass codes for the live QR. A printed or screenshot QR can be forwarded, these cannot.
CREATE TABLE IF NOT EXISTS event_pass_codes (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id  BIGINT NOT NULL,
  code        CHAR(10) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  used_gate   VARCHAR(60) NULL,
  created_ip  VARCHAR(64) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pass_code (code),
  KEY idx_pass_code_booking (booking_id, expires_at),
  CONSTRAINT fk_passcode_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_booking_attendees (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT NOT NULL,
  position   INT NOT NULL,
  name       VARCHAR(120) NOT NULL,
  phone      VARCHAR(20) NOT NULL,
  email      VARCHAR(190) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendee_slot (booking_id, position),
  KEY idx_attendee_email (email),
  KEY idx_attendee_phone (phone),
  CONSTRAINT fk_attendee_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- People the organiser has barred from entry. Enforced in the check-in query, not in the UI.
CREATE TABLE IF NOT EXISTS event_entry_blocks (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT NULL,
  email      VARCHAR(190) NULL,
  phone      VARCHAR(20) NULL,
  name       VARCHAR(120) NULL,
  reason     VARCHAR(255) NOT NULL,
  scope      ENUM('all_events','event') NOT NULL DEFAULT 'all_events',
  event_id   INT NULL,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  blocked_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_block_email (email, active),
  KEY idx_block_phone (phone, active),
  KEY idx_block_booking (booking_id, active),
  CONSTRAINT fk_block_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_block_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_payments (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id   BIGINT NOT NULL,
  provider     ENUM('dev','razorpay','admin') NOT NULL DEFAULT 'dev',
  provider_ref VARCHAR(120) NULL,
  amount       INT NOT NULL,
  status       ENUM('created','captured','failed','refunded') NOT NULL DEFAULT 'created',
  raw          JSON NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_epay_booking (booking_id),
  KEY idx_epay_provider_ref (provider, provider_ref),
  CONSTRAINT fk_epay_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------------
-- Operations: pause switch, webhook idempotency, email reminders
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  value_json  JSON NOT NULL,
  updated_by  INT NULL,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  provider   VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  event_id   VARCHAR(120) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  booking_id BIGINT NULL,
  amount     INT NULL,
  outcome    VARCHAR(40) NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_webhook_event (provider, event_id),
  KEY idx_webhook_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_reminders (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  booking_id    BIGINT NOT NULL,
  reminder_type ENUM('payment_pending','event_24h','event_2h') NOT NULL,
  status        ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
  attempts      INT NOT NULL DEFAULT 0,
  sent_at       DATETIME NULL,
  last_error    VARCHAR(255) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reminder_booking_type (booking_id, reminder_type),
  KEY idx_reminder_status (status, created_at),
  CONSTRAINT fk_reminder_booking FOREIGN KEY (booking_id) REFERENCES event_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every outbound email is recorded here. OTP codes and QR tokens are never
-- written to this table; it stores delivery metadata for support and audit.
CREATE TABLE IF NOT EXISTS email_log (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind          ENUM('otp','pass','reminder','test','notice') NOT NULL,
  recipient     VARCHAR(190) NOT NULL,
  subject       VARCHAR(255) NOT NULL,
  booking_id    BIGINT NULL,
  reference     VARCHAR(40) NULL,
  reminder_type VARCHAR(30) NULL,
  status        ENUM('sent','logged','failed') NOT NULL,
  provider      ENUM('smtp','console') NOT NULL DEFAULT 'smtp',
  error         VARCHAR(255) NULL,
  meta          JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_log_created (created_at),
  KEY idx_email_log_booking (booking_id),
  KEY idx_email_log_kind (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
