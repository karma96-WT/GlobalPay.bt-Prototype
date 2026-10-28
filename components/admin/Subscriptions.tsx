'use client';
import { useState } from 'react';
import { Badge, Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, money, fmtDate } from '@/lib/api';

/** Admin side of merchant subscriptions: who is on which plan, who is about to expire, payments received through BFS, and manual actions. */
export default function Subscriptions() {
  const { data, mutate } = useApi<any>('admin/subscriptions', 10000);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [state, setState] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  if (!data) return null;
  const act = (id: string, body: any, ok: string) =>
    run(() => api(`admin/subscriptions/${id}/action`, 'POST', body).then(() => mutate()), ok);
  const soon = (m: any) => m.plan !== 'Basic' && m.status === 'Active' && m.daysLeft <= 3;
  const rows = data.merchants.filter(
    (m: any) =>
      m.name.toLowerCase().includes(q.toLowerCase()) &&
      (!plan || m.plan === plan) &&
      (!state || (state === 'Expiring soon' ? soon(m) : m.status === state)),
  );
  return (
    <>
      <div className="line" style={{ border: 0 }}>
        <small>
          Reminders are emailed 3 days before a plan ends. This runs daily on its own; you can also
          run it now.
        </small>
        <button
          className="alt"
          onClick={() =>
            run(
              () =>
                api('admin/reminders/run', 'POST').then((r) => {
                  mutate();
                  toast(`Reminders sent: ${r.reminded}. Plans expired: ${r.expired}.`);
                }),
              'Checked',
            )
          }
        >
          Run reminders now
        </button>
      </div>
      <div className="filters">
        <input
          style={{ flex: 2 }}
          placeholder="Search by merchant"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">All plans</option>
          <option>Basic</option>
          <option>Gold</option>
          <option>Premium</option>
        </select>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All states</option>
          <option>Active</option>
          <option>Expiring soon</option>
          <option>Expired</option>
        </select>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Plan</th>
              <th>Ends</th>
              <th>Last payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m: any) => (
              <tr key={m.id}>
                <td>
                  <b>{m.name}</b>
                  <br />
                  <small>
                    {m.owner} · {m.ownerEmail}
                  </small>
                </td>
                <td>
                  {m.plan} <Badge s={m.status} />
                  {soon(m) && (
                    <span className="badge b-warn" style={{ marginLeft: 6 }}>
                      Expiring soon
                    </span>
                  )}
                </td>
                <td>
                  {m.periodEnd ? (
                    <>
                      {fmtDate(m.periodEnd)}
                      <br />
                      <small>{m.daysLeft} days left</small>
                    </>
                  ) : (
                    <small>No expiry</small>
                  )}
                </td>
                <td>{m.lastPaid ? fmtDate(m.lastPaid) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <select
                    style={{ width: 110 }}
                    value=""
                    onChange={(e) =>
                      e.target.value &&
                      confirm(
                        `Set ${m.name} to ${e.target.value}? This records a manual payment.`,
                      ) &&
                      act(
                        m.id,
                        { action: 'set-plan', plan: e.target.value },
                        `${m.name} is now on ${e.target.value}`,
                      )
                    }
                  >
                    <option value="">Set plan…</option>
                    <option>Basic</option>
                    <option>Gold</option>
                    <option>Premium</option>
                  </select>{' '}
                  {m.plan !== 'Basic' && (
                    <>
                      <button
                        className="alt"
                        title="Payment received outside the platform"
                        onClick={() =>
                          act(m.id, { action: 'mark-paid' }, 'Marked as paid for one more month')
                        }
                      >
                        Mark paid
                      </button>{' '}
                      <button
                        className="alt"
                        onClick={() => act(m.id, { action: 'waive' }, 'Extended by one month')}
                      >
                        Waive month
                      </button>{' '}
                      <button
                        className="alt"
                        onClick={() => act(m.id, { action: 'remind' }, 'Reminder emailed')}
                      >
                        Remind
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5}>No merchants match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 20 }}>Subscription payments</h3>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Merchant</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Covers until</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p: any) => (
              <tr key={p.id}>
                <td>{fmtDate(p.created_at)}</td>
                <td>{p.legal_name}</td>
                <td>{p.plan}</td>
                <td>{money(p.amount_minor)}</td>
                <td>{p.method}</td>
                <td>{fmtDate(p.period_end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Toast m={msg} />
    </>
  );
}
