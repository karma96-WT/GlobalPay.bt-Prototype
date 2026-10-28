'use client';
import { useState } from 'react';
import { Acc, Badge, InvoiceView } from '@/components/ui';
import { useApi, money, fmtTime } from '@/lib/api';

export default function Transactions({ me }: { me: any }) {
  const { data: txns = [] } = useApi<any[]>('transactions', 8000);
  const { data: invoices = [] } = useApi<any[]>(
    me.perms.includes('invoice.view') ? 'invoices' : null,
  );
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [prov, setProv] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState('');
  const rows = txns.filter(
    (t) =>
      `${t.id} ${t.customer} ${t.email} ${t.invoiceNo || ''} ${t.providerTxnId || ''}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!status || t.status === status) &&
      (!prov || t.prov === prov) &&
      (!from || t.at.slice(0, 10) >= from) &&
      (!to || t.at.slice(0, 10) <= to),
  );
  return (
    <>
      <div className="filters">
        <input
          style={{ flex: 2 }}
          placeholder="Search by customer, transaction, invoice or reference"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['Successful', 'Failed', 'Pending', 'Refunded'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={prov} onChange={(e) => setProv(e.target.value)}>
          <option value="">All providers</option>
          <option>RMA</option>
          <option>BoB</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="From date"
        />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Transaction</th>
              <th>Date</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Provider</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const inv = invoices.find((i) => i.no === t.invoiceNo);
              const o = open === t.id;
              return [
                <tr key={t.id} className="clk" onClick={() => setOpen(o ? '' : t.id)}>
                  <td>
                    <b>{t.kind === 'subscription' ? 'Subscription payment' : t.customer || '—'}</b>
                    <br />
                    <small>{t.email}</small>
                  </td>
                  <td>{t.id}</td>
                  <td>{fmtTime(t.at)}</td>
                  <td>{t.invoiceNo || '—'}</td>
                  <td>{money(t.amount)}</td>
                  <td>{t.prov}</td>
                  <td>
                    <Badge s={t.status} />
                  </td>
                </tr>,
                <tr key={t.id + 'x'}>
                  <td colSpan={7} style={{ padding: 0, border: o ? undefined : 0 }}>
                    <Acc open={o}>
                      <div style={{ padding: '0 12px' }}>
                        {inv ? (
                          <InvoiceView iv={inv} />
                        ) : (
                          <div className="note" style={{ margin: 12 }}>
                            {t.kind === 'subscription'
                              ? 'GlobalPay.bt subscription fee.'
                              : 'No invoice is linked to this transaction.'}
                          </div>
                        )}
                        <div className="note">
                          <small>
                            Provider reference {t.providerTxnId || '—'} · Response code{' '}
                            {t.code || '—'}
                          </small>
                          {t.status === 'Successful' && (
                            <a
                              className="btn alt"
                              style={{ marginLeft: 12 }}
                              href={`/api/receipts/${t.id}`}
                            >
                              Download receipt (PDF)
                            </a>
                          )}
                        </div>
                      </div>
                    </Acc>
                  </td>
                </tr>,
              ];
            })}
            {!rows.length && (
              <tr>
                <td colSpan={7}>No transactions match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
