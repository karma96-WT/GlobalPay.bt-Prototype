'use client';
import { useState } from 'react';
import { Badge, Toast, useToast } from '@/components/ui';
import { DocRow, downloadAllZip } from '@/components/Docs';
import { useApi, fmtDate } from '@/lib/api';

/** Every document you submitted, grouped by provider application. View each one or download a provider's set as one zip. */
export default function Documents() {
  const { data: apps = [] } = useApi<any[]>('apps', 10000);
  const [busy, setBusy] = useState('');
  const [msg, toast] = useToast();
  return (
    <>
      {apps.map((a) => (
        <div className="card" key={a.id}>
          <div className="line" style={{ border: 0, padding: 0 }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {a.prov} · {a.id}
              </h3>
              <small>Submitted {fmtDate(a.date)}</small> <Badge s={a.status} />
            </div>
            {a.route !== 'cred' && a.docs.some((d: any) => !d.demo) && (
              <button
                className="alt"
                disabled={busy === a.id}
                onClick={async () => {
                  setBusy(a.id);
                  try {
                    await downloadAllZip(a);
                  } catch {
                    toast('Could not prepare the zip file');
                  }
                  setBusy('');
                }}
              >
                {busy === a.id ? 'Preparing…' : `Download all ${a.prov} documents (zip)`}
              </button>
            )}
          </div>
          {a.route === 'cred' ? (
            <p>
              <small>Submitted with an existing merchant ID. No documents.</small>
            </p>
          ) : (
            a.docs.map((d: any) => <DocRow key={d.n} appId={a.id} doc={d} />)
          )}
        </div>
      ))}
      {!apps.length && <div className="card">No documents yet.</div>}
      <Toast m={msg} />
    </>
  );
}
