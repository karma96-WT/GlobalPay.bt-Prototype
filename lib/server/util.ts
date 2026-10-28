import nodemailer from 'nodemailer';
import { query, Q } from './db';

// ---------- audit ----------
export const audit = (
  userId: string | null,
  action: string,
  entity?: string,
  entityId?: string,
  detail?: any,
  ip = '',
  q: Q = query,
) =>
  q(
    'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip, detail) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, action, entity ?? null, entityId ?? null, ip, detail ? JSON.stringify(detail) : null],
  ).catch(() => {});

// ---------- email ----------
/**
 * Every email is written to email_outbox. If SMTP_HOST is set it is also sent for real;
 * otherwise it stays as "Logged" so you can read it under Admin, Email outbox.
 */
export async function queueEmail(
  to: string,
  subject: string,
  body: string,
  kind: string,
  q: Q = query,
) {
  const [row] = await q(
    'INSERT INTO email_outbox (to_email, subject, body, kind) VALUES ($1,$2,$3,$4) RETURNING id',
    [to, subject, body, kind],
  );
  if (!process.env.SMTP_HOST)
    return q("UPDATE email_outbox SET status = 'Logged' WHERE id = $1", [row.id]);
  try {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    await t.sendMail({
      from: process.env.MAIL_FROM || 'GlobalPay.bt <no-reply@globalpay.bt>',
      to,
      subject,
      text: body,
    });
    await q("UPDATE email_outbox SET status = 'Sent', sent_at = now() WHERE id = $1", [row.id]);
  } catch (e: any) {
    await q("UPDATE email_outbox SET status = 'Failed', error = $2 WHERE id = $1", [
      row.id,
      String(e.message).slice(0, 300),
    ]);
  }
}

// ---------- notifications ----------
type Audience = 'merchant' | 'operator' | 'admin';
/**
 * Add a notification. For a business, members who agreed to email notifications
 * at registration also get the same message by email.
 */
export async function notify(
  audience: Audience,
  category: string,
  title: string,
  body: string,
  merchantId: string | null = null,
  q: Q = query,
) {
  await q(
    'INSERT INTO notifications (audience, merchant_id, category, title, body) VALUES ($1,$2,$3,$4,$5)',
    [audience, merchantId, category, title, body],
  );
  if (audience === 'merchant' && merchantId) {
    const people = await q(
      "SELECT email FROM users WHERE merchant_id = $1 AND email_consent AND status = 'active'",
      [merchantId],
    );
    for (const p of people)
      await queueEmail(
        p.email,
        `GlobalPay.bt: ${title}`,
        `${title}\n\n${body}\n\nYou receive this because you agreed to email notifications.`,
        'notification',
        q,
      );
  }
}

export const appUrl = (req?: Request) =>
  process.env.APP_URL || (req ? new URL(req.url).origin : 'http://localhost:3000');
export const today = () => new Date().toISOString().slice(0, 10);
