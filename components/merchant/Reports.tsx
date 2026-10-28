'use client';
import { useState } from 'react';
import { Badge, Stat } from '@/components/ui';
import { useApi, money, fmtTime } from '@/lib/api';

type T = {
  id: string;
  at: string;
  amount: number;
  status: string;
  customer: string;
  invoiceNo: string | null;
  kind: string;
  prov: string;
};
const weekStart = (iso: string) => {
  const d = new Date(iso.slice(0, 10));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const summarise = (list: T[]) => {
  const ok = list.filter((t) => t.status === 'Successful');
  const failed = list.filter((t) => t.status === 'Failed').length;
  const volume = ok.reduce((a, t) => a + t.amount, 0);
  return {
    count: list.length,
    ok: ok.length,
    failed,
    volume,
    rate: ok.length + failed ? Math.round((ok.length / (ok.length + failed)) * 100) : 0,
    avg: ok.length ? Math.round(volume / ok.length) : 0,
  };
};
const group = (list: T[], key: (t: T) => string) => {
  const m = new Map<string, T[]>();
  list.forEach((t) => {
    const k = key(t);
    m.set(k, [...(m.get(k) || []), t]);
  });
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
};
const download = (name: string, rows: (string | number)[][]) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob(
      [rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')],
      { type: 'text/csv' },
    ),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
};

/** Sales figures count successful payments on invoices only. */
export default function Reports() {
  const { data: all = [] } = useApi<T[]>('transactions', 10000);
  const [view, setView] = useState('Daily');
  const [openKey, setOpenKey] = useState('');
  const sales = all.filter((t) => t.kind === 'invoice');
  const total = summarise(sales);
  const ym = new Date().toISOString().slice(0, 7);
  const month = summarise(sales.filter((t) => t.at.startsWith(ym)));

  const TxnTable = ({ list }: { list: T[] }) => (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Transaction</th>
          <th>Customer</th>
          <th>Invoice</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {list.map((t) => (
          <tr key={t.id}>
            <td>{fmtTime(t.at)}</td>
            <td>{t.id}</td>
            <td>{t.customer || '—'}</td>
            <td>{t.invoiceNo || '—'}</td>
            <td>{money(t.amount)}</td>
            <td>
              <Badge s={t.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const Summary = ({ title, groups }: { title: string; groups: [string, T[]][] }) => (
    <table>
      <thead>
        <tr>
          <th>{title}</th>
          <th>Transactions</th>
          <th>Successful</th>
          <th>Failed</th>
          <th>Success rate</th>
          <th>Sales volume</th>
          <th>Average sale</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(([k, l]) => {
          const s = summarise(l);
          return (
            <tr key={k}>
              <td>
                <b>{k}</b>
              </td>
              <td>{s.count}</td>
              <td>{s.ok}</td>
              <td>{s.failed}</td>
              <td>{s.rate}%</td>
              <td>{money(s.volume)}</td>
              <td>{money(s.avg)}</td>
            </tr>
          );
        })}
        {!groups.length && (
          <tr>
            <td colSpan={7}>No transactions yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  );

  // every week from the first transaction to this week, including quiet ones
  const weeks = () => {
    if (!sales.length) return [] as [string, T[]][];
    const by = new Map(group(sales, (t) => weekStart(t.at)));
    const out: [string, T[]][] = [];
    const first = sales.map((t) => weekStart(t.at)).sort()[0];
    for (
      let d = new Date(weekStart(new Date().toISOString()));
      d.toISOString().slice(0, 10) >= first;
      d.setUTCDate(d.getUTCDate() - 7)
    )
      out.push([d.toISOString().slice(0, 10), by.get(d.toISOString().slice(0, 10)) || []]);
    return out;
  };
  const csv = () =>
    download(
      `${view.toLowerCase()}-report.csv`,
      view === 'Daily'
        ? [
            ['Date', 'Transaction', 'Customer', 'Invoice', 'Amount (Nu.)', 'Status'],
            ...sales.map((t) => [
              t.at,
              t.id,
              t.customer,
              t.invoiceNo || '',
              t.amount / 100,
              t.status,
            ]),
          ]
        : [
            [view, 'Transactions', 'Successful', 'Failed', 'Sales (Nu.)'],
            ...(view === 'Weekly'
              ? weeks()
              : view === 'Monthly'
                ? group(sales, (t) => t.at.slice(0, 7))
                : group(sales, (t) => t.at.slice(0, 4))
            ).map(([k, l]) => {
              const s = summarise(l);
              return [k, s.count, s.ok, s.failed, s.volume / 100];
            }),
          ],
    );

  return (
    <>
      <div className="grid">
        <Stat n={money(total.volume)} l="Total sales (successful payments only)" />
        <Stat
          n={money(month.volume)}
          l={`Sales this month · ${month.ok} payment${month.ok === 1 ? '' : 's'}`}
        />
        <Stat n={total.ok} l="Successful payments" />
        <Stat n={total.rate + '%'} l="Success rate (successful vs failed)" />
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="line" style={{ border: 0, padding: 0 }}>
          <div className="tabs" style={{ margin: 0 }}>
            {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((x) => (
              <button key={x} className={view === x ? 'on' : ''} onClick={() => setView(x)}>
                {x}
              </button>
            ))}
          </div>
          <button className="alt" disabled={!sales.length} onClick={csv}>
            Download CSV
          </button>
        </div>
        {view === 'Daily' && (
          <>
            <p>
              <small>Every transaction, newest first.</small>
            </p>
            <TxnTable list={sales} />
          </>
        )}
        {view === 'Weekly' && (
          <>
            <p>
              <small>
                Every week from your first transaction. Click a week to see its transactions.
              </small>
            </p>
            {weeks().map(([k, l]) => {
              const s = summarise(l);
              const o = openKey === k;
              return (
                <div key={k} style={{ borderBottom: '1px solid var(--line)' }}>
                  <div
                    className="line clk"
                    style={{ cursor: 'pointer', border: 0 }}
                    onClick={() => setOpenKey(o ? '' : k)}
                  >
                    <span>
                      <b>Week of {k}</b>{' '}
                      <small>
                        {s.count} transactions · {s.ok} successful · {s.failed} failed
                      </small>
                    </span>
                    <b>{money(s.volume)}</b>
                  </div>
                  {o &&
                    (l.length ? <TxnTable list={l} /> : <small>No transactions this week.</small>)}
                </div>
              );
            })}
            {!sales.length && <p>No transactions yet.</p>}
          </>
        )}
        {view === 'Monthly' && (
          <Summary title="Month" groups={group(sales, (t) => t.at.slice(0, 7))} />
        )}
        {view === 'Yearly' && (
          <Summary title="Year" groups={group(sales, (t) => t.at.slice(0, 4))} />
        )}
      </div>
    </>
  );
}
