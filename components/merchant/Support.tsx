'use client';
import { useState } from 'react';
import { Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, ago, fmtTime } from '@/lib/api';

const badge = (s: string) => (
  <span className={'badge ' + (s === 'Resolved' ? 'b-ok' : s === 'Open' ? 'b-warn' : '')}>{s}</span>
);

/** Support goes to the operators. Feedback goes to the admins. Both are answered here and by email. */
export default function Support() {
  const { data: tickets = [] } = useApi<any[]>('tickets', 6000);
  const { data: contacts } = useApi<any>('contacts');
  const [kind, setKind] = useState<'support' | 'feedback'>('support');
  const [form, setForm] = useState({ subject: '', category: 'Payment', body: '' });
  const [no, setNo] = useState('');
  const [reply, setReply] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const list = tickets.filter((t) => t.kind === kind);
  const cur = tickets.find((t) => t.no === no);

  if (cur)
    return (
      <>
        <button className="alt" onClick={() => setNo('')}>
          ← Back
        </button>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="line" style={{ border: 0 }}>
            <h3 style={{ margin: 0 }}>
              {cur.no} · {cur.subject}
            </h3>
            {badge(cur.status)}
          </div>
          {cur.msgs.map((m: any, i: number) => (
            <div
              key={i}
              className="note"
              style={{ background: m.from === 'staff' ? 'var(--lime2)' : 'var(--soft)' }}
            >
              <small>
                {m.from === 'staff' ? `GlobalPay.bt (${m.by})` : 'You'} · {fmtTime(m.at)}
              </small>
              <p style={{ margin: '4px 0 0' }}>{m.body}</p>
            </div>
          ))}
          {cur.status !== 'Resolved' && (
            <>
              <label>Add a message</label>
              <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
              <p>
                <button
                  disabled={!reply.trim()}
                  onClick={async () => {
                    if (
                      await run(
                        () => api(`tickets/${cur.no}/messages`, 'POST', { body: reply }),
                        'Message sent',
                      )
                    )
                      setReply('');
                  }}
                >
                  Send
                </button>
              </p>
            </>
          )}
        </div>
        <Toast m={msg} />
      </>
    );

  const c = contacts || {};
  return (
    <>
      <div className="grid" style={{ marginBottom: 16 }}>
        {(['operator', 'admin'] as const).map(
          (k) =>
            c[k] && (
              <div className="card" key={k} style={{ margin: 0 }}>
                <small>
                  {k === 'operator' ? 'Support (operators)' : 'Feedback and escalations (admin)'}
                </small>
                <h3 style={{ margin: '4px 0' }}>{c[k].name}</h3>
                <small>
                  {c[k].email}
                  <br />
                  {c[k].phone}
                </small>
              </div>
            ),
        )}
      </div>
      <div className="tabs">
        <button className={kind === 'support' ? 'on' : ''} onClick={() => setKind('support')}>
          Support requests
        </button>
        <button className={kind === 'feedback' ? 'on' : ''} onClick={() => setKind('feedback')}>
          Feedback to admin
        </button>
      </div>
      <div className="card">
        <h3>{kind === 'support' ? 'New support request' : 'Send feedback'}</h3>
        <small>
          {kind === 'support'
            ? 'Goes to the GlobalPay.bt operators. Replies arrive here and by email.'
            : 'Goes to the GlobalPay.bt admin team: suggestions, complaints or problems with support.'}
        </small>
        <div className="row">
          <div>
            <label>Subject *</label>
            <input
              value={form.subject}
              placeholder={
                kind === 'support'
                  ? 'Customer was charged twice'
                  : 'The reports page is very helpful'
              }
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div>
            <label>Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {(kind === 'support'
                ? ['Payment', 'Refund', 'Application', 'Technical', 'Account', 'Other']
                : ['Suggestion', 'Complaint', 'Praise', 'Other']
              ).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <label>Message *</label>
        <textarea
          rows={3}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <p>
          <button
            disabled={!form.subject.trim() || !form.body.trim()}
            onClick={async () => {
              if (await run(() => api('tickets', 'POST', { ...form, kind }), 'Sent'))
                setForm({ subject: '', category: form.category, body: '' });
            }}
          >
            Send
          </button>
        </p>
      </div>
      <div className="card">
        <h3>Your {kind === 'support' ? 'requests' : 'feedback'}</h3>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Subject</th>
              <th>Updated</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.no} className="clk" onClick={() => setNo(t.no)}>
                <td>{t.no}</td>
                <td>{t.subject}</td>
                <td>{ago(t.msgs[t.msgs.length - 1].at)}</td>
                <td>{badge(t.status)}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4}>Nothing yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Toast m={msg} />
    </>
  );
}
