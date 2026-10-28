-- GlobalPay.bt demo database for Neon (PostgreSQL 15 or 16)
-- Run in the Neon SQL Editor: 01_schema.sql, then 02_seed.sql.
--
-- Conventions
--   * Money is BIGINT minor units (1 Nu. = 100 chhertum). Never floating point.
--   * Timestamps are timestamptz (UTC); the app shows Bhutan Time (UTC+6).
--   * Passwords are bcrypt hashes. Session tokens and API keys are stored only as SHA-256 hashes.
--   * Business rows are never hard-deleted. audit_logs and provider_messages are append-only.
--   * Demo simplification: uploaded documents and receipt PDFs are stored in Postgres (bytea).
--
-- RBAC: every user has one role (roles.code). A role is a list of permission codes (roles.perms).
--   Platform roles (ADMIN, OPERATOR) belong to GlobalPay staff. Merchant roles belong to a business:
--   four standard ones plus custom roles a merchant Owner creates (roles.merchant_id is set).
-- The server checks permissions on every request; the screens only hide what the server would refuse.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE SEQUENCE app_seq START 60;
CREATE SEQUENCE ticket_seq START 13;
CREATE SEQUENCE receipt_seq START 1001;

-- ============ BUSINESSES ============
CREATE TABLE merchants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name    text NOT NULL,
  business_type text NOT NULL DEFAULT 'Private limited'
                CHECK (business_type IN ('Private limited', 'Sole proprietor', 'Government office')),
  license_no    text,
  address       text,
  phone         text CHECK (phone ~ '^\+975(17|16|77)[0-9]{6}$'),
  email         text,
  website       text,
  rep_name      text,
  rep_cid       text CHECK (rep_cid ~ '^[0-9]{11}$'),
  tech_contact  text,
  plan          text NOT NULL DEFAULT 'Basic' CHECK (plan IN ('Basic', 'Gold', 'Premium')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX merchants_name_uq ON merchants (lower(legal_name));
CREATE UNIQUE INDEX merchants_license_uq ON merchants (license_no) WHERE license_no IS NOT NULL;
CREATE TRIGGER merchants_upd BEFORE UPDATE ON merchants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ ROLES AND PERMISSIONS ============
CREATE TABLE roles (
  code        text PRIMARY KEY,
  scope       text NOT NULL CHECK (scope IN ('platform', 'merchant')),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  perms       text[] NOT NULL DEFAULT '{}',
  merchant_id uuid REFERENCES merchants (id) ON DELETE CASCADE,   -- set for a merchant's custom roles
  is_system   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============ PEOPLE ============
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text NOT NULL,
  mobile               text CHECK (mobile ~ '^\+975(17|16|77)[0-9]{6}$'),
  full_name            text NOT NULL,
  password_hash        text NOT NULL,
  role_code            text NOT NULL REFERENCES roles (code),
  merchant_id          uuid REFERENCES merchants (id),
  -- merchant owners only: new = account only, applied = business submitted, merchant = onboarded
  onboarding_stage     text NOT NULL DEFAULT 'merchant' CHECK (onboarding_stage IN ('new', 'applied', 'merchant')),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  must_change_password boolean NOT NULL DEFAULT false,   -- true for accounts created by someone else
  email_consent        boolean NOT NULL DEFAULT false,   -- agreed to notification emails to the registered address
  language             text NOT NULL DEFAULT 'en' CHECK (language IN ('en')),
  created_by           uuid REFERENCES users (id),
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX users_mobile_uq ON users (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX users_merchant_idx ON users (merchant_id);
CREATE TRIGGER users_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- ============ SUBSCRIPTIONS (the merchant's plan fee, paid through BFS Secure) ============
CREATE TABLE subscriptions (
  merchant_id  uuid PRIMARY KEY REFERENCES merchants (id) ON DELETE CASCADE,
  plan         text NOT NULL CHECK (plan IN ('Basic', 'Gold', 'Premium')),
  status       text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Expired')),
  period_start date,
  period_end   date,                                   -- null for the free Basic plan
  reminder_for date,                                   -- the period_end a 3-day reminder was already sent for
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscription_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    uuid NOT NULL REFERENCES merchants (id),
  plan           text NOT NULL,
  amount_minor   bigint NOT NULL CHECK (amount_minor >= 0),
  method         text NOT NULL CHECK (method IN ('BFS Secure', 'Manual', 'Waived')),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  order_no       text,
  provider_txn_id text,
  note           text,
  recorded_by    uuid REFERENCES users (id),            -- staff member for Manual and Waived
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sub_pay_merchant_idx ON subscription_payments (merchant_id, created_at DESC);

-- ============ APPLICATIONS AND DOCUMENTS ============
CREATE TABLE applications (
  id                   text PRIMARY KEY,               -- e.g. GP-2610-0041
  merchant_id          uuid NOT NULL REFERENCES merchants (id),
  provider             text NOT NULL CHECK (provider IN ('RMA', 'BoB')),
  route                text NOT NULL DEFAULT 'docs' CHECK (route IN ('docs', 'cred')),
  status               text NOT NULL DEFAULT 'Pending'
                       CHECK (status IN ('Pending', 'Correction required', 'Waiting', 'Approved', 'Rejected')),
  submitted_on         date NOT NULL DEFAULT CURRENT_DATE,
  operator_name        text,
  provided_merchant_id text,
  operator_note        text,
  rejection_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_application_uq ON applications (merchant_id, provider)
  WHERE status IN ('Pending', 'Correction required', 'Waiting');
CREATE INDEX applications_status_idx ON applications (status, submitted_on);
CREATE TRIGGER applications_upd BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE application_documents (
  application_id text NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  doc_name       text NOT NULL,
  position       int NOT NULL DEFAULT 0,
  file_name      text,                                 -- null = demo record without a stored file
  file_size      int,
  mime           text,
  state          text NOT NULL DEFAULT 'Uploaded' CHECK (state IN ('Uploaded', 'Verified', 'Returned')),
  note           text,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, doc_name)
);
CREATE TABLE files (                                    -- the bytes of an uploaded document
  application_id text NOT NULL,
  doc_name       text NOT NULL,
  data           bytea NOT NULL,
  PRIMARY KEY (application_id, doc_name),
  FOREIGN KEY (application_id, doc_name) REFERENCES application_documents ON DELETE CASCADE
);

CREATE TABLE merchant_provider_accounts (               -- a merchant's live link to a provider
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    uuid NOT NULL REFERENCES merchants (id),
  provider       text NOT NULL CHECK (provider IN ('RMA', 'BoB')),
  beneficiary_id text NOT NULL CHECK (beneficiary_id ~ '^[A-Z0-9]{1,10}$'),
  bank_code      text,
  enabled        boolean NOT NULL DEFAULT true,         -- the merchant's on/off switch
  provider_ref   text,
  accepted_on    date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider),
  UNIQUE (provider, beneficiary_id)                     -- an ID belongs to exactly one merchant
);

-- ============ INVOICES ============
CREATE TABLE invoices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id       uuid NOT NULL REFERENCES merchants (id),
  invoice_no        text NOT NULL,
  pay_token         text NOT NULL UNIQUE,               -- unguessable token in the public payment link
  issue_date        date NOT NULL DEFAULT CURRENT_DATE,
  currency          text NOT NULL DEFAULT 'Nu.' CHECK (currency IN ('Nu.', 'INR', 'USD')),
  merchant_snapshot jsonb NOT NULL,                     -- name, address, phone, email frozen at issue
  customer_name     text,
  customer_email    text,
  customer_mobile   text CHECK (customer_mobile ~ '^\+975(17|16|77)[0-9]{6}$'),
  notes             text,
  total_minor       bigint NOT NULL CHECK (total_minor > 0),
  status            text NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid', 'Cancelled')),
  benf_id           text,
  benf_bank         text,
  sent_to           text,
  sent_at           timestamptz,
  txn_ref           text,
  paid_at           timestamptz,
  created_by        uuid REFERENCES users (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, invoice_no)
);
CREATE INDEX invoices_merchant_idx ON invoices (merchant_id, issue_date DESC);
CREATE TABLE invoice_items (
  invoice_id       uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_no          int NOT NULL,
  description      text NOT NULL,
  quantity         numeric(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor > 0),
  discount_kind    text NOT NULL DEFAULT 'none' CHECK (discount_kind IN ('none', 'pct', 'amt')),   -- per item
  discount_value   numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  PRIMARY KEY (invoice_id, line_no)
);
CREATE TABLE invoice_charges (                          -- tax, delivery, service, other
  invoice_id uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  line_no    int NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('Tax', 'Delivery', 'Service', 'Other')),
  label      text,                                       -- required when kind = Other (checked by the app)
  mode       text NOT NULL CHECK (mode IN ('pct', 'amt')),
  value      numeric(12, 2) NOT NULL CHECK (value >= 0),
  PRIMARY KEY (invoice_id, line_no)
);

-- ============ PAYMENTS ============
CREATE TABLE payment_attempts (                         -- created when a customer or merchant starts paying
  order_no     text PRIMARY KEY,                          -- bfs_orderNo, unique per attempt
  kind         text NOT NULL CHECK (kind IN ('invoice', 'subscription')),
  merchant_id  uuid NOT NULL REFERENCES merchants (id),
  invoice_id   uuid REFERENCES invoices (id),
  plan         text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  benf_id      text NOT NULL,
  created_by   uuid REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transactions (
  id              text PRIMARY KEY,                       -- e.g. TX-409908
  merchant_id     uuid NOT NULL REFERENCES merchants (id),
  invoice_id      uuid REFERENCES invoices (id),
  kind            text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice', 'subscription')),
  provider        text NOT NULL CHECK (provider IN ('RMA', 'BoB')),
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  currency        text NOT NULL DEFAULT 'Nu.',
  status          text NOT NULL CHECK (status IN ('Pending', 'Successful', 'Failed', 'Refunded')),
  customer_name   text,
  customer_email  text,
  order_no        text,
  provider_txn_id text,                                   -- bfs_bfsTxnId
  response_code   text,                                   -- bfs_debitAuthCode
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX txn_provider_uq ON transactions (provider, provider_txn_id) WHERE provider_txn_id IS NOT NULL;
CREATE INDEX txn_merchant_idx ON transactions (merchant_id, occurred_at DESC);
CREATE INDEX txn_invoice_idx ON transactions (invoice_id);
CREATE TABLE receipts (                                 -- the PDF given to the customer, kept as a record
  txn_id     text PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
  number     text NOT NULL UNIQUE,                        -- e.g. GPR-2026-001001
  pdf        bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_messages (                        -- raw AR / AC / AS messages
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no       text,
  transaction_id text REFERENCES transactions (id),
  direction      text NOT NULL CHECK (direction IN ('OUTBOUND', 'INBOUND')),
  msg_type       text NOT NULL,
  payload        jsonb NOT NULL,
  signature_valid boolean,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER provider_messages_append_only BEFORE UPDATE OR DELETE ON provider_messages
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ============ COMMUNICATION ============
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience    text NOT NULL CHECK (audience IN ('merchant', 'operator', 'admin')),
  merchant_id uuid REFERENCES merchants (id),           -- set when audience = merchant
  category    text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_idx ON notifications (audience, merchant_id, created_at DESC);

CREATE TABLE support_tickets (                          -- support goes to operators, feedback to admins
  no          text PRIMARY KEY,                         -- SUP-13 or FDB-14
  kind        text NOT NULL DEFAULT 'support' CHECK (kind IN ('support', 'feedback')),
  merchant_id uuid REFERENCES merchants (id),
  opened_by   uuid REFERENCES users (id),
  contact     jsonb NOT NULL,                           -- name, email, phone of the person who wrote
  subject     text NOT NULL,
  category    text NOT NULL DEFAULT 'Other',
  status      text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In progress', 'Resolved')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_idx ON support_tickets (kind, merchant_id);
CREATE TABLE ticket_messages (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_no   text NOT NULL REFERENCES support_tickets (no) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('merchant', 'staff')),
  author_name text NOT NULL,
  body        text NOT NULL,
  emailed_to  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_idx ON ticket_messages (ticket_no, created_at);

CREATE TABLE email_outbox (                             -- every email the platform sends or would send
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email   text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  kind       text NOT NULL,                             -- notification, invoice, reminder, support, welcome
  status     text NOT NULL DEFAULT 'Queued' CHECK (status IN ('Queued', 'Sent', 'Logged', 'Failed')),
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
CREATE INDEX email_outbox_idx ON email_outbox (created_at DESC);

-- ============ INTEGRATIONS AND PLATFORM ============
CREATE TABLE api_keys (                                 -- shown once at creation; only the hash is kept
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants (id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('test', 'live')),
  key_prefix  text NOT NULL,
  key_hash    text NOT NULL UNIQUE,
  created_by  uuid REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX api_keys_active_uq ON api_keys (merchant_id, mode) WHERE revoked_at IS NULL;

CREATE TABLE platform_settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE audit_logs (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  user_id   uuid REFERENCES users (id),
  action    text NOT NULL,                              -- e.g. auth.login, application.forward
  entity    text,
  entity_id text,
  ip        text,
  detail    jsonb
);
CREATE INDEX audit_at_idx ON audit_logs (at DESC);
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
