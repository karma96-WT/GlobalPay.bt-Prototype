-- GlobalPay.bt demo data. Run after 01_schema.sql.
-- Every demo account uses the password  Demo@12345  (change it after the first login in a real deployment).
--   admin@globalpay.bt      Admin
--   operator@globalpay.bt   Operator
--   owner@druktrails.bt     Merchant owner   (Gold plan, RMA approved, BoB waiting)
--   tshewang@druktrails.bt  Merchant finance
--   dorji@druktrails.bt     Merchant developer
--   sonam@druktrails.bt     Merchant support

-- ---------- roles ----------
INSERT INTO roles (code, scope, name, description, perms) VALUES
 ('ADMIN', 'platform', 'Admin', 'Manages staff, merchants, subscriptions, feedback and platform settings.',
  '{application.view,merchant.view,document.view,transaction.view,employee.manage,subscription.manage,feedback.handle,audit.view,settings.manage}'),
 ('OPERATOR', 'platform', 'Operator', 'Reviews documents, forwards applications, records provider replies, answers support.',
  '{application.view,application.review,response.record,support.reply,merchant.view,document.view}'),
 ('MERCHANT_OWNER', 'merchant', 'Owner', 'Full access including team and plan.',
  '{invoice.create,invoice.view,payment.view,refund.issue,report.export,provider.toggle,application.manage,developer.manage,support.manage,business.edit,team.manage,plan.manage}'),
 ('MERCHANT_FINANCE', 'merchant', 'Finance', 'Invoices, payments, refunds and reports.',
  '{invoice.create,invoice.view,payment.view,refund.issue,report.export}'),
 ('MERCHANT_DEVELOPER', 'merchant', 'Developer', 'API keys and webhooks, read-only payments.',
  '{invoice.view,payment.view,developer.manage}'),
 ('MERCHANT_SUPPORT', 'merchant', 'Support', 'Looks up payments and handles customer issues.',
  '{invoice.view,payment.view,support.manage}');

-- ---------- platform settings ----------
INSERT INTO platform_settings (key, value) VALUES
 ('contacts', '{"admin":{"name":"GlobalPay.bt Admin","email":"admin@globalpay.bt","phone":"+97516345678","for":"Feedback and escalations"},
                "operator":{"name":"GlobalPay.bt Support Desk","email":"operator@globalpay.bt","phone":"+97577234567","for":"Support requests"}}'),
 ('plans', '{"Basic":{"fee_minor":0,"seats":2},"Gold":{"fee_minor":150000,"seats":10},"Premium":{"fee_minor":490000,"seats":null}}'),
 ('platform_beneficiary', '{"id":"BE00000001","note":"Placeholder. Replace with the beneficiary ID RMA issues to GlobalPay.bt for subscription payments."}');

-- ---------- businesses ----------
INSERT INTO merchants (id, legal_name, business_type, license_no, address, phone, email, rep_name, rep_cid, plan) VALUES
 ('11111111-1111-1111-1111-111111111111', 'Druk Trails Pvt Ltd', 'Private limited', 'TL-2019-04417', 'Norzin Lam, Thimphu', '+97517123456', 'owner@druktrails.bt', 'Karma Wangchuk', '11005001234', 'Gold'),
 ('22222222-2222-2222-2222-222222222222', 'Thimphu Bakehouse', 'Sole proprietor', 'TL-2021-01873', 'Chang Lam, Thimphu', '+97577234500', 'hello@thimphubakehouse.bt', 'Dechen Wangmo', '10301002345', 'Basic'),
 ('33333333-3333-3333-3333-333333333333', 'Himal Crafts', 'Private limited', 'TL-2018-00921', 'Zhemgang Road, Bumthang', '+97516345611', 'info@himalcrafts.bt', 'Sonam Tobgay', '10802003456', 'Basic'),
 ('44444444-4444-4444-4444-444444444444', 'Paro Stay Hotel', 'Private limited', 'TL-2016-00312', 'Airport Road, Paro', '+97517765432', 'stay@parostay.bt', 'Tashi Dorji', '10201004567', 'Basic');

-- ---------- users ----------
INSERT INTO users (email, mobile, full_name, password_hash, role_code, merchant_id, onboarding_stage, email_consent) VALUES
 ('admin@globalpay.bt',     '+97516345678', 'System Admin',     crypt('Demo@12345', gen_salt('bf', 10)), 'ADMIN',              NULL, 'merchant', true),
 ('operator@globalpay.bt',  '+97577234567', 'Pema Dorji',       crypt('Demo@12345', gen_salt('bf', 10)), 'OPERATOR',           NULL, 'merchant', true),
 ('owner@druktrails.bt',    '+97517123456', 'Karma Wangchuk',   crypt('Demo@12345', gen_salt('bf', 10)), 'MERCHANT_OWNER',     '11111111-1111-1111-1111-111111111111', 'merchant', true),
 ('tshewang@druktrails.bt', '+97577345678', 'Tshewang Lhamo',   crypt('Demo@12345', gen_salt('bf', 10)), 'MERCHANT_FINANCE',   '11111111-1111-1111-1111-111111111111', 'merchant', true),
 ('dorji@druktrails.bt',    '+97516456789', 'Dorji Penjor',     crypt('Demo@12345', gen_salt('bf', 10)), 'MERCHANT_DEVELOPER', '11111111-1111-1111-1111-111111111111', 'merchant', false),
 ('sonam@druktrails.bt',    '+97517567890', 'Sonam Choden',     crypt('Demo@12345', gen_salt('bf', 10)), 'MERCHANT_SUPPORT',   '11111111-1111-1111-1111-111111111111', 'merchant', false);

-- ---------- subscriptions (Druk Trails' Gold plan ends in 3 days, so the reminder can be demonstrated) ----------
INSERT INTO subscriptions (merchant_id, plan, status, period_start, period_end) VALUES
 ('11111111-1111-1111-1111-111111111111', 'Gold', 'Active', CURRENT_DATE - 27, CURRENT_DATE + 3),
 ('22222222-2222-2222-2222-222222222222', 'Basic', 'Active', NULL, NULL),
 ('33333333-3333-3333-3333-333333333333', 'Basic', 'Active', NULL, NULL),
 ('44444444-4444-4444-4444-444444444444', 'Basic', 'Active', NULL, NULL);
INSERT INTO subscription_payments (merchant_id, plan, amount_minor, method, period_start, period_end, order_no, provider_txn_id) VALUES
 ('11111111-1111-1111-1111-111111111111', 'Gold', 150000, 'BFS Secure', CURRENT_DATE - 27, CURRENT_DATE + 3, 'GPSEED0001', '620100009001');

-- ---------- applications ----------
INSERT INTO applications (id, merchant_id, provider, status, submitted_on, operator_name, operator_note, rejection_reason) VALUES
 ('GP-2610-0041', '11111111-1111-1111-1111-111111111111', 'RMA', 'Approved',            CURRENT_DATE - 12, 'Pema D.',   NULL, NULL),
 ('GP-2610-0042', '11111111-1111-1111-1111-111111111111', 'BoB', 'Waiting',             CURRENT_DATE - 12, 'Pema D.',   NULL, NULL),
 ('GP-2610-0050', '22222222-2222-2222-2222-222222222222', 'RMA', 'Pending',             CURRENT_DATE - 5,  NULL,        NULL, NULL),
 ('GP-2610-0053', '33333333-3333-3333-3333-333333333333', 'BoB', 'Correction required', CURRENT_DATE - 4,  'Sonam T.',  'The trade licence copy is cut off at the bottom. Please upload the full page.', NULL),
 ('GP-2610-0047', '44444444-4444-4444-4444-444444444444', 'BoB', 'Rejected',            CURRENT_DATE - 9,  'Sonam T.',  NULL, 'Certificate of incorporation does not match the trade licence name.');
INSERT INTO application_documents (application_id, doc_name, position, state)
SELECT a, d, ord, s FROM (VALUES
  ('GP-2610-0041', 'Verified'), ('GP-2610-0050', 'Uploaded')) v(a, s),
  unnest(ARRAY['Business/Trade License Copy','Company Registration Document','CID Copy of authorised representative','Bank Account Confirmation Letter']) WITH ORDINALITY t(d, ord);
INSERT INTO application_documents (application_id, doc_name, position, state)
SELECT a, d, ord, s FROM (VALUES
  ('GP-2610-0042', 'Verified'), ('GP-2610-0053', 'Returned'), ('GP-2610-0047', 'Verified')) v(a, s),
  unnest(ARRAY['CID card of proprietor/manager','Valid Trade License Copy','Certificate of Incorporation (corporate)','Passport-sized photograph']) WITH ORDINALITY t(d, ord);
UPDATE application_documents SET state = 'Verified' WHERE application_id = 'GP-2610-0053' AND doc_name <> 'Valid Trade License Copy';
UPDATE application_documents SET note = 'Cut off at the bottom' WHERE application_id = 'GP-2610-0053' AND doc_name = 'Valid Trade License Copy';

INSERT INTO merchant_provider_accounts (merchant_id, provider, beneficiary_id, bank_code, provider_ref, accepted_on) VALUES
 ('11111111-1111-1111-1111-111111111111', 'RMA', 'BE00000585', '01', 'RMA/2026/0041', CURRENT_DATE - 10);

-- ---------- invoices and payments for Druk Trails ----------
INSERT INTO invoices (id, merchant_id, invoice_no, pay_token, issue_date, merchant_snapshot, customer_name, customer_email, total_minor, status, benf_id, benf_bank, sent_to, sent_at, txn_ref, paid_at) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111111', 'INV-2026-0017', md5('seed-inv-17'), CURRENT_DATE - 1, '{"name":"Druk Trails Pvt Ltd","addr":"Norzin Lam, Thimphu","phone":"+97517123456","email":"owner@druktrails.bt"}', 'Pema Choden', 'pema.choden@example.com', 230000, 'Unpaid', 'BE00000585', '01', 'pema.choden@example.com', now() - interval '1 day', NULL, NULL),
 ('aaaaaaaa-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', 'INV-2026-0016', md5('seed-inv-16'), CURRENT_DATE, '{"name":"Druk Trails Pvt Ltd","addr":"Norzin Lam, Thimphu","phone":"+97517123456","email":"owner@druktrails.bt"}', 'Ugyen Tshering', 'ugyen.tshering@example.com', 1280000, 'Paid', 'BE00000585', '01', 'ugyen.tshering@example.com', now() - interval '5 hours', '620100000016', now() - interval '4 hours'),
 ('aaaaaaaa-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'INV-2026-0015', md5('seed-inv-15'), CURRENT_DATE, '{"name":"Druk Trails Pvt Ltd","addr":"Norzin Lam, Thimphu","phone":"+97517123456","email":"owner@druktrails.bt"}', 'Choki Dema', 'choki.dema@example.com', 450000, 'Paid', 'BE00000585', '01', 'choki.dema@example.com', now() - interval '3 hours', '620100000015', now() - interval '2 hours'),
 ('aaaaaaaa-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'INV-2026-0014', md5('seed-inv-14'), CURRENT_DATE - 2, '{"name":"Druk Trails Pvt Ltd","addr":"Norzin Lam, Thimphu","phone":"+97517123456","email":"owner@druktrails.bt"}', 'Namgay Wangdi', 'namgay.wangdi@example.com', 600000, 'Unpaid', 'BE00000585', '01', 'namgay.wangdi@example.com', now() - interval '2 days', NULL, NULL);
INSERT INTO invoice_items (invoice_id, line_no, description, quantity, unit_price_minor) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000017', 1, 'Airport transfer (Paro to Thimphu)', 1, 230000),
 ('aaaaaaaa-0000-0000-0000-000000000016', 1, 'Day tour: Paro Taktsang', 1, 1280000),
 ('aaaaaaaa-0000-0000-0000-000000000015', 1, 'Cultural trek deposit', 1, 450000),
 ('aaaaaaaa-0000-0000-0000-000000000014', 1, 'Hotel booking, per night', 2, 300000);
INSERT INTO transactions (id, merchant_id, invoice_id, provider, amount_minor, status, customer_name, customer_email, provider_txn_id, response_code, occurred_at) VALUES
 ('TX-88121', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000015', 'RMA', 450000,  'Successful', 'Choki Dema', 'choki.dema@example.com', '620100000015', '00', now() - interval '2 hours'),
 ('TX-88120', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000016', 'RMA', 1280000, 'Successful', 'Ugyen Tshering', 'ugyen.tshering@example.com', '620100000016', '00', now() - interval '4 hours'),
 ('TX-88119', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000017', 'RMA', 230000,  'Failed',     'Pema Choden', 'pema.choden@example.com', '620100000017', '51', now() - interval '1 day'),
 ('TX-88117', '11111111-1111-1111-1111-111111111111', NULL, 'BoB', 3600000, 'Pending', 'Jigme Lhendup', 'jigme@example.com', NULL, NULL, now() - interval '1 day'),
 ('TX-88110', '11111111-1111-1111-1111-111111111111', NULL, 'RMA', 150000, 'Refunded', 'Kinley Om', 'kinley.om@example.com', NULL, NULL, now() - interval '3 days');

-- ---------- notifications and support ----------
INSERT INTO notifications (audience, merchant_id, category, title, body, read, created_at) VALUES
 ('merchant', '11111111-1111-1111-1111-111111111111', 'Application', 'RMA approved your application', 'Application GP-2610-0041 was approved. Your Beneficiary ID is BE00000585. Nu. payments are now live.', false, now() - interval '3 hours'),
 ('merchant', '11111111-1111-1111-1111-111111111111', 'Payment', 'Payment TX-88121 received', 'Nu. 4,500.00 received through RMA for invoice INV-2026-0015 from Choki Dema.', false, now() - interval '2 hours'),
 ('merchant', '11111111-1111-1111-1111-111111111111', 'Payment', 'Payment TX-88119 failed', 'Nu. 2,300.00 from Pema Choden failed with code 51 (Insufficient Funds). The customer can retry from the same link.', true, now() - interval '1 day'),
 ('merchant', '11111111-1111-1111-1111-111111111111', 'Billing', 'Subscription ends in 3 days', 'Your Gold plan ends in 3 days. Renew under Settings, Plan and billing to keep 10 team seats.', false, now() - interval '10 minutes'),
 ('operator', NULL, 'Application', 'New application from Thimphu Bakehouse', 'GP-2610-0050 (RMA) is waiting for document review.', false, now() - interval '5 hours'),
 ('admin', NULL, 'Subscription', 'Druk Trails subscription ends in 3 days', 'The Gold plan for Druk Trails Pvt Ltd ends on ' || to_char(CURRENT_DATE + 3, 'YYYY-MM-DD') || '.', false, now() - interval '10 minutes');
INSERT INTO support_tickets (no, kind, merchant_id, opened_by, contact, subject, category, status, created_at)
SELECT 'SUP-12', 'support', '11111111-1111-1111-1111-111111111111', id,
       '{"name":"Karma Wangchuk","email":"owner@druktrails.bt","phone":"+97517123456"}', 'Refund query', 'Refund', 'Open', now() - interval '1 day'
  FROM users WHERE email = 'owner@druktrails.bt';
INSERT INTO ticket_messages (ticket_no, author_type, author_name, body, created_at) VALUES
 ('SUP-12', 'merchant', 'Karma Wangchuk', 'A customer paid twice for the same invoice. How do I refund one of the payments?', now() - interval '1 day');
