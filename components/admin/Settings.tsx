'use client';
import { useEffect, useState } from 'react';
import { Toast, useToast, useRun } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { MERCHANT_PERMS, STAFF_PERMS } from '@/lib/rbac';

export default function Settings() {
  const { data, mutate } = useApi<any>('admin/settings');
  const { data: roles = [] } = useApi<any[]>('admin/roles');
  const [s, setS] = useState<any>(null);
  const [msg, toast] = useToast();
  const run = useRun(toast);
  useEffect(() => {
    if (data && !s) setS(JSON.parse(JSON.stringify(data)));
  }, [data]);
  if (!s) return null;
  const set = (path: string[], v: any) => {
    const n = JSON.parse(JSON.stringify(s));
    let o = n;
    path.slice(0, -1).forEach((k) => (o = o[k]));
    o[path[path.length - 1]] = v;
    setS(n);
  };
  const labels = Object.fromEntries([...MERCHANT_PERMS, ...STAFF_PERMS]);
  return (
    <>
      <div className="card">
        <h3>Contact details shown to merchants</h3>
        <div className="row">
          {(['operator', 'admin'] as const).map((k) => (
            <div key={k}>
              <b>{k === 'operator' ? 'Support desk (operators)' : 'Admin (feedback)'}</b>
              {(['name', 'email', 'phone'] as const).map((f) => (
                <div key={f}>
                  <label>{f[0].toUpperCase() + f.slice(1)}</label>
                  <input
                    value={s.contacts[k][f]}
                    onChange={(e) => set(['contacts', k, f], e.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h3>Plans and subscription payments</h3>
        <div className="row">
          {['Gold', 'Premium'].map((p) => (
            <div key={p}>
              <label>{p} monthly fee (chhertum; 150000 = Nu. 1,500.00)</label>
              <input
                inputMode="numeric"
                value={s.plans[p].fee_minor}
                onChange={(e) =>
                  set(['plans', p, 'fee_minor'], Number(e.target.value.replace(/\D/g, '')))
                }
              />
            </div>
          ))}
        </div>
        <label>GlobalPay.bt beneficiary ID for subscription payments (issued by RMA)</label>
        <input
          value={s.platform_beneficiary.id}
          maxLength={10}
          onChange={(e) => set(['platform_beneficiary', 'id'], e.target.value.toUpperCase())}
        />
        <small>{s.platform_beneficiary.note}</small>
        <p>
          <button
            onClick={() =>
              run(() => api('admin/settings', 'PUT', s).then(() => mutate()), 'Settings saved')
            }
          >
            Save settings
          </button>
        </p>
      </div>
      <div className="card">
        <h3>Roles and permissions</h3>
        <small>
          Platform roles are fixed. Merchant roles are the four standard ones plus any custom roles
          merchants created.
        </small>
        {roles.map((r) => (
          <div className="line" key={r.code} style={{ alignItems: 'flex-start' }}>
            <div>
              <b>{r.name}</b>{' '}
              <small>
                {r.scope}
                {r.custom ? ' · custom' : ''}
              </small>
              <br />
              <small>{r.desc}</small>
            </div>
            <div style={{ maxWidth: 420, textAlign: 'right' }}>
              {r.perms.map((p: string) => (
                <span
                  key={p}
                  className="badge"
                  style={{ margin: 2, display: 'inline-block' }}
                  title={labels[p]}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Toast m={msg} />
    </>
  );
}
