# GlobalPay.bt prototype with a real database (Neon Postgres)

Next.js 14 (App Router) + TypeScript. The browser talks to `/api/*` route handlers, which check who you are
and what your role allows, then read and write a Neon Postgres database. Nothing is kept in the browser any more
except the simulated BFS Secure session.

## 1. Create the database (Neon)

1. Sign in at https://neon.tech and create a project (any region).
2. Open **SQL Editor**. Paste the whole of `db/01_schema.sql` and press **Run**. Then paste `db/02_seed.sql` and **Run**.
   (To wipe everything and start again, run `db/00_reset.sql`, then 01 and 02 again.)
3. Open **Connect**, choose the **Pooled connection** and copy the connection string.

## 2. Run the app

```bash
cp .env.example .env.local        # then paste your connection string after DATABASE_URL=
npm install
npm run dev                       # http://localhost:3000
```

Use Node 18.18 or newer. `npm run format` formats the code (Prettier also runs on save in VS Code).

## 3. Demo accounts

Every account uses the password **Demo@12345**. Do not leave these accounts on a public deployment.

| Email                  | Role                                 | Lands on        |
| ---------------------- | ------------------------------------ | --------------- |
| owner@druktrails.bt    | Merchant Owner (Gold plan, RMA live) | merchant portal |
| tshewang@druktrails.bt | Merchant Finance                     | merchant portal |
| dorji@druktrails.bt    | Merchant Developer                   | merchant portal |
| sonam@druktrails.bt    | Merchant Support                     | merchant portal |
| operator@globalpay.bt  | Operator                             | operator portal |
| admin@globalpay.bt     | Admin                                | admin portal    |

Create your own merchant at `/register`: you land on "Register your business", not on the dashboard.

## 4. Roles and permissions (RBAC)

A role is a list of permission codes stored in `roles.perms`. The **server** checks the permission on every request
(`lib/server/dispatch.ts`); the screens only hide what the server would refuse. A signed-in person can never read
another business's data: the business always comes from the session, never from the browser.

| Permission                                              | Owner | Finance | Developer | Support |
| ------------------------------------------------------- | :---: | :-----: | :-------: | :-----: |
| invoice.create (create, send, cancel invoices)          |  ✔   |   ✔    |           |         |
| invoice.view                                            |  ✔   |   ✔    |    ✔     |   ✔    |
| payment.view (transactions, receipts)                   |  ✔   |   ✔    |    ✔     |   ✔    |
| report.export (reports)                                 |  ✔   |   ✔    |           |         |
| refund.issue (permission exists, refunds not built yet) |  ✔   |   ✔    |           |         |
| provider.toggle                                         |  ✔   |         |           |         |
| application.manage (applications, documents)            |  ✔   |         |           |         |
| developer.manage (API keys)                             |  ✔   |         |    ✔     |         |
| support.manage (support requests)                       |  ✔   |         |           |   ✔    |
| business.edit                                           |  ✔   |         |           |         |
| team.manage (add members, roles)                        |  ✔   |         |           |         |
| plan.manage (subscription)                              |  ✔   |         |           |         |

Staff: the **Operator** reviews documents, forwards applications, records provider replies and answers support.
The **Admin** manages staff, merchants, subscriptions, feedback, audit logs and platform settings. An operator can
never approve a provider's service: only recording the provider's reply does, and the database refuses otherwise.

Adding team members: the Owner enters name, email, role and a **temporary password**. The member signs in with it and
is sent to a page that makes them choose their own password before anything else works. The number of members is
limited by the plan (Basic 2, Gold 10, Premium unlimited).

## 5. Subscriptions and email reminders

A merchant pays a plan fee through the same simulated BFS Secure pages, to GlobalPay.bt's own beneficiary ID
(`platform_settings`, editable under Admin, Platform Settings; the seeded ID is a placeholder). The admin side is
**Admin, Subscriptions**. A reminder email goes out 3 days before a plan ends: `vercel.json` runs
`/api/cron/reminders` daily on Vercel (set `CRON_SECRET`), and **Run reminders now** does the same on demand.
Emails are always saved under **Admin, Email Outbox**; they are really delivered only if you set the `SMTP_*`
variables in `.env.local`.

## 6. Deploy on Vercel

Import the repository, add `DATABASE_URL` (pooled), `CRON_SECRET` and optionally `APP_URL` and `SMTP_*`, deploy.

## 7. What is real and what is simulated

| Real                                                                         | Simulated or not built                                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Accounts, bcrypt passwords, server-side sessions (HttpOnly cookie)           | No OTP or MFA codes: no SMS or email provider is connected                                                                                     |
| Role and permission checks on every request                                  | The BFS Secure pages are a simulation. The checksum is SHA-256 (the specification allows SHA-2); production signing follows RMA's key exchange |
| Documents and receipt PDFs stored in the database (4 MB per file, demo only) | Bank of Bhutan's message format: BoB payments are not built                                                                                    |
| Invoice maths done on the server, payments recorded once, tamper checks      | Refunds, webhooks and the API itself (keys are issued, nothing consumes them yet)                                                              |
| Audit log, email outbox, notifications with optional email copies            | Notification read-state is shared by everyone in the same role                                                                                 |

## 8. Checks

`npm run test:api` runs 78 checks of the real API handlers against an in-memory Postgres (no Neon needed):
sign-in, every role boundary, registration, uploads, the provider workflow, invoices, tampered payments,
receipts, team and first-login password change, subscriptions and reminders, support and feedback.

## Folder map

```
db/                SQL for the Neon SQL Editor (00 reset, 01 schema, 02 demo data)
app/api/[...path]  one entry point for every API call
lib/server/        database, sessions, permissions, receipts, email; routes/ holds the endpoints
lib/               shared: invoice maths, BFS messages, validation, permission lists, API helpers
components/        screens: merchant/, operator/, admin/ and shared pieces
app/               pages: sign in, register, onboarding, change-password, portals, pay/, bfs/, subscribe/
scripts/           the API test (npm run test:api)
```
