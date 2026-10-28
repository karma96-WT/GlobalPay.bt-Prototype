'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Acc, InvoiceView, Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, money, fmtDate } from '@/lib/api';

/**
 * Tabs:  Paid · Pending (sent, no failed attempt yet) · Unpaid/Failed (unpaid with a failed attempt) · All (also cancelled)
 */
export default function Invoices({ me }: { me: any }) {
  const { data: all = [] } = useApi<any[]>('invoices', 8000);
  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const canEdit = me.perms.includes('invoice.create');

  const kind = (i: any) =>
    i.status === 'Paid'
      ? 'Paid'
      : i.status === 'Cancelled'
        ? 'Cancelled'
        : i.failed
          ? 'Unpaid/Failed'
          : 'Pending';
  const count = (t: string) => all.filter((i) => t === 'All' || kind(i) === t).length;
  const text = (i: any) =>
    `${i.no} ${i.cust.name} ${i.cust.email} ${(i.total / 100).toFixed(2)}`.toLowerCase();
  const rows = all
    .filter(
      (i) =>
        (tab === 'All' || kind(i) === tab) &&
        text(i).includes(q.toLowerCase()) &&
        (!from || i.date >= from) &&
        (!to || i.date <= to),
    )
    .sort((a, b) =>
      ({
        new: () => b.date.localeCompare(a.date) || b.no.localeCompare(a.no),
        old: () => a.date.localeCompare(b.date) || a.no.localeCompare(b.no),
        high: () => b.total - a.total,
        low: () => a.total - b.total,
        no: () => a.no.localeCompare(b.no),
      })[sort]!(),
    );

  return (
    <>
      <div className="tabs">
        {['All', 'Paid', 'Pending', 'Unpaid/Failed'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t} ({count(t)})
          </button>
        ))}
      </div>
      <div className="filters">
        <input
          style={{ flex: 2 }}
          placeholder="Search by invoice number, customer, email or amount"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="high">Amount: high to low</option>
          <option value="low">Amount: low to high</option>
          <option value="no">Invoice number</option>
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
              <th>Invoice</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const o = open === i.no;
              const k = kind(i);
              return [
                <tr key={i.no} className="clk" onClick={() => setOpen(o ? '' : i.no)}>
                  <td>{i.no}</td>
                  <td>
                    {i.cust.name || '—'}
                    <br />
                    <small>{i.cust.email}</small>
                  </td>
                  <td>{fmtDate(i.date)}</td>
                  <td>{money(i.total)}</td>
                  <td>
                    <span
                      className={
                        'badge ' +
                        (k === 'Paid'
                          ? 'b-ok'
                          : k === 'Unpaid/Failed'
                            ? 'b-bad'
                            : k === 'Cancelled'
                              ? ''
                              : 'b-warn')
                      }
                    >
                      {k}
                    </span>
                  </td>
                </tr>,
                <tr key={i.no + 'x'}>
                  <td colSpan={5} style={{ padding: 0, border: o ? undefined : 0 }}>
                    <Acc open={o}>
                      <div style={{ padding: '0 12px 12px' }}>
                        <InvoiceView iv={i} />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Link className="btn alt" href={`/pay/${i.token}`} target="_blank">
                            Open payment page
                          </Link>
                          {canEdit && i.status === 'Unpaid' && (
                            <button
                              className="alt"
                              onClick={() =>
                                run(
                                  () =>
                                    api(`invoices/${i.id}/action`, 'POST', { action: 'resend' }),
                                  'Invoice emailed again',
                                )
                              }
                            >
                              Resend
                            </button>
                          )}
                          {canEdit && i.status === 'Unpaid' && (
                            <button
                              className="alt"
                              onClick={() =>
                                confirm(`Cancel invoice ${i.no}?`) &&
                                run(
                                  () =>
                                    api(`invoices/${i.id}/action`, 'POST', { action: 'cancel' }),
                                  'Invoice cancelled',
                                )
                              }
                            >
                              Cancel invoice
                            </button>
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
                <td colSpan={5}>No invoices match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Toast m={msg} />
    </>
  );
}
