'use client';
import { useState } from 'react';
import { Badge, Toast, useToast, useRun } from '@/components/ui';
import { DocRow, downloadAllZip } from '@/components/Docs';
import { api, useApi, fmtDate } from '@/lib/api';

const FILTERS = ['All', 'Pending', 'Waiting', 'Approved', 'Rejected', 'Correction required'];

/** Operators check completeness, accept or return each document, and forward. They never approve. */
export default function Inbox() {
  const { data: apps = [] } = useApi<any[]>('apps', 6000);
  const [filter, setFilter] = useState('All');
  const [prov, setProv] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState('');
  const [note, setNote] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const app = apps.find((a) => a.id === openId);
  const act = (body: any, ok: string, close = false) =>
    run(() => api(`apps/${app.id}/action`, 'POST', body), ok).then((r) => {
      if (r && close) setOpenId('');
    });

  if (!app) {
    const rows = apps.filter(
      (a) =>
        (filter === 'All' || a.status === filter) &&
        (!prov || a.prov === prov) &&
        `${a.who} ${a.id}`.toLowerCase().includes(q.toLowerCase()),
    );
    return (
      <>
        <div className="tabs">
          {FILTERS.map((s) => (
            <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="filters">
          <input
            style={{ flex: 2 }}
            placeholder="Search by business or application ID"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={prov} onChange={(e) => setProv(e.target.value)}>
            <option value="">All providers</option>
            <option>RMA</option>
            <option>BoB</option>
          </select>
        </div>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Applicant</th>
                <th>ID</th>
                <th>Submitted</th>
                <th>Provider</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  className="clk"
                  key={a.id}
                  onClick={() => {
                    setOpenId(a.id);
                    setNote('');
                  }}
                >
                  <td>{a.who}</td>
                  <td>{a.id}</td>
                  <td>{fmtDate(a.date)}</td>
                  <td>{a.prov}</td>
                  <td>
                    <Badge s={a.status} />
                  </td>
                  <td>
                    <button className="alt">Open</button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>Nothing matches.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const allVerified = app.route === 'cred' || app.docs.every((d: any) => d.state === 'Verified');
  return (
    <>
      <button className="alt" onClick={() => setOpenId('')}>
        ← Back to inbox
      </button>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="line" style={{ border: 0 }}>
          <h3 style={{ margin: 0 }}>
            {app.who} · {app.id}
          </h3>
          {app.route !== 'cred' && app.docs.some((d: any) => !d.demo) && (
            <button
              className="alt"
              onClick={() => downloadAllZip(app).catch(() => toast('Could not prepare the zip'))}
            >
              Download all (zip)
            </button>
          )}
        </div>
        <p>
          Provider: {app.prov} · Status: <Badge s={app.status} /> · Route:{' '}
          {app.route === 'cred' ? `Existing credentials (ID ${app.mid || '—'})` : 'Documents'}
          <br />
          <small>
            {app.contact.name} · {app.contact.email} · {app.contact.phone}
          </small>
        </p>
        {app.status === 'Rejected' && (
          <div className="note warn">
            The provider rejected this application{app.reason ? `: ${app.reason}` : ''}. It must not
            be forwarded again as it is. Ask the merchant to correct and resubmit.
          </div>
        )}
        {app.route !== 'cred' && (
          <>
            <h3>Documents</h3>
            {app.docs.map((d: any) => (
              <DocRow key={d.n} appId={app.id} doc={d}>
                {app.status === 'Pending' && d.state !== 'Verified' && (
                  <button
                    onClick={() =>
                      act(
                        { action: 'accept-doc', doc: d.n },
                        'Document accepted. Merchant notified.',
                      )
                    }
                  >
                    Accept
                  </button>
                )}
                {app.status === 'Pending' && d.state !== 'Returned' && (
                  <button
                    className="alt"
                    onClick={() => {
                      const why = prompt(
                        `Why is "${d.n}" being returned?`,
                        'Unreadable or expired',
                      );
                      if (why)
                        act(
                          { action: 'return-doc', doc: d.n, reason: why },
                          'Document returned. Merchant notified.',
                        );
                    }}
                  >
                    Return
                  </button>
                )}
              </DocRow>
            ))}
          </>
        )}
        <label>Note to merchant</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="note">
          Operators check completeness only. The provider alone approves or rejects.
        </p>
        {['Pending', 'Rejected'].includes(app.status) && (
          <button
            className="alt"
            onClick={() =>
              act(
                { action: 'correction', note },
                app.status === 'Rejected'
                  ? 'Merchant asked to resubmit'
                  : 'Merchant asked to correct',
                true,
              )
            }
          >
            {app.status === 'Rejected' ? 'Request resubmission' : 'Request correction'}
          </button>
        )}{' '}
        {app.status === 'Pending' && (
          <button
            disabled={!allVerified}
            onClick={() => act({ action: 'forward' }, `Forwarded to ${app.prov}`, true)}
          >
            Forward to {app.prov}
          </button>
        )}
        {app.status === 'Pending' && !allVerified && (
          <small> Accept every document to enable forwarding.</small>
        )}
        {['Waiting', 'Approved', 'Correction required'].includes(app.status) && (
          <small>
            {app.status === 'Waiting'
              ? 'Already forwarded. Record the provider reply under Provider Responses.'
              : app.status === 'Approved'
                ? 'Approved by the provider. No action needed.'
                : 'Waiting for the merchant to resubmit.'}
          </small>
        )}
      </div>
      <Toast m={msg} />
    </>
  );
}
