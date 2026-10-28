'use client';
import { useState } from 'react';
import { Toast, useToast, useRun } from '@/components/ui';
import { api, useApi } from '@/lib/api';

/**
 * The provider replies by email. The operator reads it and records the decision here. An acceptance must carry
 * the provider-issued ID, which can belong to one merchant only (the server refuses duplicates).
 */
export default function Responses() {
  const { data: apps = [] } = useApi<any[]>('apps', 6000);
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [open, setOpen] = useState<{ id: string; kind: 'accept' | 'reject' } | null>(null);
  const [f, setF] = useState({
    benf: '',
    bank: '01',
    ref: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const waiting = apps.filter((a) => a.status === 'Waiting');
  const benf = f.benf.trim().toUpperCase();
  const label = (a: any) => (a.prov === 'RMA' ? 'Beneficiary ID' : 'Merchant ID (MID)');
  const done = () => {
    setOpen(null);
    setF({ ...f, benf: '', ref: '', reason: '' });
  };

  return (
    <div className="card">
      <p>
        <small>
          When a provider replies by email, record its decision here. The merchant is notified
          straight away.
        </small>
      </p>
      {waiting.map((a) => {
        const o = open?.id === a.id ? open.kind : null;
        const bad = benf && !/^[A-Z0-9]{1,10}$/.test(benf);
        return (
          <div className="line" key={a.id} style={{ display: 'block' }}>
            <div className="line" style={{ border: 0, padding: 0 }}>
              <span>
                {a.id} · {a.who} · {a.prov}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setOpen({ id: a.id, kind: 'accept' })}>Accepted</button>
                <button className="alt" onClick={() => setOpen({ id: a.id, kind: 'reject' })}>
                  Rejected
                </button>
              </span>
            </div>
            {o === 'accept' && (
              <div className="note" style={{ marginTop: 10 }}>
                <div className="row">
                  <div>
                    <label>
                      {label(a)} issued by {a.prov} *
                    </label>
                    <input
                      value={f.benf}
                      maxLength={10}
                      placeholder="BE00000585"
                      onChange={(e) => setF({ ...f, benf: e.target.value })}
                    />
                    {bad && <div className="err">Use up to 10 letters or digits</div>}
                  </div>
                  {a.prov === 'RMA' && (
                    <div>
                      <label>Beneficiary bank code</label>
                      <select value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })}>
                        {['01', '02', '03', '04'].map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="row">
                  <div>
                    <label>Provider reference (from the email)</label>
                    <input
                      value={f.ref}
                      placeholder="RMA/2026/0123"
                      onChange={(e) => setF({ ...f, ref: e.target.value })}
                    />
                  </div>
                  <div>
                    <label>Date of the provider's reply</label>
                    <input
                      type="date"
                      value={f.date}
                      onChange={(e) => setF({ ...f, date: e.target.value })}
                    />
                  </div>
                </div>
                <p style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={!benf || !!bad}
                    onClick={async () => {
                      if (
                        await run(
                          () =>
                            api(`apps/${a.id}/action`, 'POST', {
                              action: 'accept',
                              benfId: benf,
                              bank: f.bank,
                              ref: f.ref,
                              date: f.date,
                            }),
                          'Recorded: accepted. Merchant notified.',
                        )
                      )
                        done();
                    }}
                  >
                    Save and approve
                  </button>
                  <button className="alt" onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                </p>
              </div>
            )}
            {o === 'reject' && (
              <div className="note" style={{ marginTop: 10 }}>
                <label>Reason given by the provider *</label>
                <textarea
                  rows={2}
                  value={f.reason}
                  onChange={(e) => setF({ ...f, reason: e.target.value })}
                />
                <p style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="out"
                    disabled={!f.reason.trim()}
                    onClick={async () => {
                      if (
                        await run(
                          () =>
                            api(`apps/${a.id}/action`, 'POST', {
                              action: 'reject',
                              reason: f.reason,
                            }),
                          'Recorded: rejected. Merchant notified.',
                        )
                      )
                        done();
                    }}
                  >
                    Save rejection
                  </button>
                  <button className="alt" onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                </p>
              </div>
            )}
          </div>
        );
      })}
      {!waiting.length && <small>Nothing is waiting for a provider reply.</small>}
      <Toast m={msg} />
    </div>
  );
}
