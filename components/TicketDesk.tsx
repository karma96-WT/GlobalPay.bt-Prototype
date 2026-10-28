'use client';
import { useState } from 'react';
import { Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, ago, fmtTime } from '@/lib/api';

const badge = (s: string) => (
  <span className={'badge ' + (s === 'Resolved' ? 'b-ok' : s === 'Open' ? 'b-warn' : '')}>{s}</span>
);

/** Staff inbox for support (operators) or feedback (admins). Replies are emailed to the person who wrote. */
export default function TicketDesk({ kind }: { kind: 'support' | 'feedback' }) {
  const { data: tickets = [] } = useApi<any[]>('tickets', 6000);
  const [no, setNo] = useState('');
  const [reply, setReply] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const t = tickets.find((x) => x.no === no);
  const rows = tickets.filter(
    (x) =>
      x.kind === kind &&
      (!status || x.status === status) &&
      `${x.subject} ${x.biz} ${x.contact.name} ${x.contact.email}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );

  if (!t)
    return (
      <>
        <div className="filters">
          <input
            style={{ flex: 2 }}
            placeholder="Search by subject, merchant or person"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option>Open</option>
            <option>In progress</option>
            <option>Resolved</option>
          </select>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>{kind === 'support' ? 'Merchant' : 'From'}</th>
                <th>Contact</th>
                <th>Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.no} className="clk" onClick={() => setNo(x.no)}>
                  <td>
                    <b>{x.subject}</b>
                    <br />
                    <small>
                      {x.no} · {x.cat}
                    </small>
                  </td>
                  <td>{x.biz}</td>
                  <td>
                    {x.contact.name}
                    <br />
                    <small>{x.contact.email}</small>
                  </td>
                  <td>{ago(x.msgs[x.msgs.length - 1].at)}</td>
                  <td>{badge(x.status)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5}>Nothing here.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );

  return (
    <>
      <button className="alt" onClick={() => setNo('')}>
        ← All {kind === 'support' ? 'requests' : 'feedback'}
      </button>
      <div className="split" style={{ gridTemplateColumns: '1fr 300px', marginTop: 14 }}>
        <div className="card">
          <div className="line" style={{ border: 0 }}>
            <h3 style={{ margin: 0 }}>{t.subject}</h3>
            {badge(t.status)}
          </div>
          <small>
            {t.no} · {t.cat}
          </small>
          {t.msgs.map((m: any, i: number) => (
            <div
              key={i}
              className="note"
              style={{
                background: m.from === 'staff' ? 'var(--lime2)' : 'var(--soft)',
                marginTop: 10,
              }}
            >
              <small>
                {m.from === 'staff' ? `You (${m.by})` : m.by} · {fmtTime(m.at)}
                {m.emailedTo && ` · emailed to ${m.emailedTo}`}
              </small>
              <p style={{ margin: '4px 0 0' }}>{m.body}</p>
            </div>
          ))}
          {t.status !== 'Resolved' ? (
            <>
              <label>Reply (emailed to {t.contact.email} and shown in their account)</label>
              <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
              <p style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={!reply.trim()}
                  onClick={async () => {
                    if (
                      await run(
                        () => api(`tickets/${t.no}/messages`, 'POST', { body: reply }),
                        `Reply emailed to ${t.contact.email}`,
                      )
                    )
                      setReply('');
                  }}
                >
                  Send reply by email
                </button>
                <button
                  className="alt"
                  onClick={() =>
                    run(
                      () => api(`tickets/${t.no}`, 'PATCH', { status: 'Resolved' }),
                      'Marked resolved',
                    )
                  }
                >
                  Mark resolved
                </button>
              </p>
            </>
          ) : (
            <button
              className="alt"
              onClick={() =>
                run(() => api(`tickets/${t.no}`, 'PATCH', { status: 'Open' }), 'Reopened')
              }
            >
              Reopen
            </button>
          )}
        </div>
        <div className="card">
          <h3>{kind === 'support' ? 'Merchant' : 'Sender'}</h3>
          <p>
            <b>{t.biz}</b>
          </p>
          <small>Contact</small>
          <br />
          {t.contact.name}
          <br />
          <small>Email</small>
          <br />
          {t.contact.email}
          <br />
          <small>Phone</small>
          <br />
          {t.contact.phone || '—'}
        </div>
      </div>
      <Toast m={msg} />
    </>
  );
}
