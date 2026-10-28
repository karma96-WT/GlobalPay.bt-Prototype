'use client';
import { Badge, Sw, Toast, useToast, useRun } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { PROVIDER_DOCS } from '@/lib/providers';

export default function Providers({ me }: { me: any }) {
  const { data: conns = [] } = useApi<any[]>('connections');
  const { data: apps = [] } = useApi<any[]>('apps');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const canToggle = me.perms.includes('provider.toggle');
  return (
    <>
      {Object.entries(PROVIDER_DOCS).map(([code, p]) => {
        const c = conns.find((x) => x.prov === code);
        const approved = apps.some((a) => a.prov === code && a.status === 'Approved') && c;
        return (
          <div className="card hov" key={code}>
            <div className="line" style={{ border: 0, padding: 0 }}>
              <div>
                <b style={{ fontSize: 18 }}>{p.name}</b>{' '}
                <Badge
                  s={
                    approved
                      ? c.on
                        ? 'Active'
                        : 'Paused'
                      : apps.find((a) => a.prov === code)?.status || 'Not applied'
                  }
                />
                <br />
                <small>
                  {code === 'RMA'
                    ? 'Nu. payments from local bank accounts'
                    : 'Visa and Mastercard in INR and USD'}
                </small>
                {approved && (
                  <>
                    <br />
                    <small>
                      {code === 'RMA' ? 'Beneficiary ID' : 'Merchant ID'}: <b>{c.benfId}</b>
                      {c.bank && ` · Bank code ${c.bank}`}
                    </small>
                  </>
                )}
              </div>
              {approved ? (
                <div style={{ textAlign: 'right' }}>
                  <Sw
                    on={c.on}
                    disabled={!canToggle}
                    set={(v) =>
                      run(
                        () => api('connections/toggle', 'POST', { prov: code, on: v }),
                        `${code} ${v ? 'enabled' : 'paused'}`,
                      )
                    }
                  />
                  <br />
                  <small>{c.on ? 'Accepting payments' : 'Paused'}</small>
                </div>
              ) : (
                <small>Toggle available after approval</small>
              )}
            </div>
            {approved && !c.on && (
              <div className="note warn" style={{ marginTop: 12 }}>
                Paused: hidden from new invoices. Unpaid links for this provider will not work until
                you enable it again.
              </div>
            )}
          </div>
        );
      })}
      <Toast m={msg} />
    </>
  );
}
