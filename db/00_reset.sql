-- DANGER: deletes every GlobalPay.bt table. Run only when you want a clean start.
DROP TABLE IF EXISTS audit_logs, email_outbox, platform_settings, api_keys, ticket_messages, support_tickets,
  notifications, provider_messages, receipts, transactions, payment_attempts, invoice_charges, invoice_items,
  invoices, merchant_provider_accounts, files, application_documents, applications, subscription_payments,
  subscriptions, sessions, users, roles, merchants CASCADE;
DROP SEQUENCE IF EXISTS app_seq, ticket_seq, receipt_seq;
DROP FUNCTION IF EXISTS forbid_mutation() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
