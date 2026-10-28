'use client';
import { useState } from 'react';
import { Badge, Toast, useToast, useRun } from '@/components/ui';
import { DocRow } from '@/components/Docs';
import { api, useApi, fmtDate } from '@/lib/api';

const EDITABLE = ['Pending', 'Correction required'];

export default function Applications() {
  const { data: apps = [] } = useApi<any[]>('apps', 8000);
  const [openId, setOpenId] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const app = apps.find((a) => a.id === openId);

  if (!app)
    return (
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Provider</th>
              <th>Submitted</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id} className="clk" onClick={() => setOpenId(a.id)}>
                <td>{a.id}</td>
                <td>{a.prov}</td>
                <td>{fmtDate(a.date)}</td>
                <td>
                  <Badge s={a.status} />
                </td>
                <td>
                  <button className="alt">Open</button>
                </td>
              </tr>
            ))}
            {!apps.length && (
              <tr>
                <td colSpan={5}>No applications yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );

  const editable = EDITABLE.includes(app.status);
  return (
    <>
      <button className="alt" onClick={() => setOpenId('')}>
        ← All applications
      </button>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="line" style={{ border: 0 }}>
          <div>
            <h3 style={{ margin: 0 }}>{app.id}</h3>
            <small>
              {app.prov} · submitted {fmtDate(app.date)}
            </small>
          </div>
          <Badge s={app.status} />
        </div>
        <div className="row">
          <div>
            <small>Route</small>
            <br />
            {app.route === 'cred' ? 'Existing credentials' : 'Documents'}
          </div>
          <div>
            <small>Business</small>
            <br />
            {app.who}
          </div>
        </div>
        {app.route === 'cred' && (
          <p>
            <small>Merchant ID you provided</small>
            <br />
            <b>{app.mid || '—'}</b>
          </p>
        )}
        {app.note && <div className="note warn">Operator note: {app.note}</div>}
        {app.reason && (
          <div className="note warn">Provider's reason for rejection: {app.reason}</div>
        )}
        {!editable && (
          <div className="note">
            {app.status === 'Approved'
              ? 'Approved by the provider.'
              : 'This application has been forwarded to the provider, so documents are locked. Contact support if something is wrong.'}
          </div>
        )}
      </div>
      {app.route !== 'cred' && (
        <div className="card">
          <h3>Submitted documents</h3>
          {app.docs.map((d: any) => (
            <DocRow key={d.n} appId={app.id} doc={d} editable={editable} />
          ))}
        </div>
      )}
      {app.status === 'Correction required' && (
        <button
          onClick={() =>
            run(
              () => api(`apps/${app.id}/action`, 'POST', { action: 'resubmit' }),
              'Resubmitted for review',
            )
          }
        >
          Resubmit for review
        </button>
      )}
      <Toast m={msg} />
    </>
  );
}
