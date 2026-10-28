'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui';
import { api, refreshAll, useApi, ago, fmtTime } from '@/lib/api';

const CATS = [
  'Application',
  'Document',
  'Payment',
  'Invoice',
  'Provider',
  'Team',
  'Support',
  'Feedback',
  'Billing',
  'Subscription',
  'Security',
];

/** Notification centre with search and filters: list on the left, full message on the right. */
export default function Notes() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sel, setSel] = useState('');
  const qs = new URLSearchParams({
    ...(q && { q }),
    ...(cat && { cat }),
    ...(from && { from }),
    ...(to && { to }),
    ...(status === 'unread' && { unread: '1' }),
  }).toString();
  const { data: list = [] } = useApi<any[]>('notifications' + (qs ? '?' + qs : ''), 5000);
  const shown = status === 'read' ? list.filter((n) => n.read) : list;
  const cur = shown.find((n) => n.id === sel) || shown[0];
  const open = async (n: any) => {
    setSel(n.id);
    if (!n.read) {
      await api('notifications/read', 'POST', { ids: [n.id] });
      refreshAll();
    }
  };
  const reset = () => {
    setQ('');
    setCat('');
    setStatus('');
    setFrom('');
    setTo('');
  };
  return (
    <>
      <div className="filters">
        <input
          style={{ flex: 2 }}
          placeholder="Search by client, invoice, payment or keyword"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Read and unread</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="From date"
          title="From date"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="To date"
          title="To date"
        />
        <button className="alt" style={{ flex: 'none' }} onClick={reset}>
          Clear
        </button>
      </div>
      <div className="split">
        <div className="card" style={{ padding: 8, maxHeight: 560, overflow: 'auto' }}>
          {shown.map((n) => (
            <div
              key={n.id}
              className={'msg' + (cur?.id === n.id ? ' on' : '')}
              onClick={() => open(n)}
            >
              <span className={'dot' + (n.read ? ' r' : '')} />
              <div>
                <b>{n.title}</b>
                <br />
                <small>
                  {n.cat} · {ago(n.at)}
                </small>
              </div>
            </div>
          ))}
          {!shown.length && <p style={{ padding: 12 }}>No notifications match.</p>}
        </div>
        <div className="card">
          {cur ? (
            <>
              <Badge s={cur.cat === 'Payment' ? 'Successful' : 'Pending'} />
              <h3 style={{ marginTop: 10 }}>{cur.title}</h3>
              <small>
                {fmtTime(cur.at)} · {cur.cat}
              </small>
              <p>{cur.body}</p>
              <button
                className="alt"
                onClick={async () => {
                  await api('notifications/read', 'POST', { all: true });
                  refreshAll();
                }}
              >
                Mark all read
              </button>
            </>
          ) : (
            <p>Nothing to show.</p>
          )}
        </div>
      </div>
    </>
  );
}
