'use client';
import { useEffect, useState } from 'react';
import { PhoneInput, Toast, useToast, useRun, full, local } from '@/components/ui';
import { api, refreshAll } from '@/lib/api';
import { EMAIL_RE, LOCAL_MOBILE_RE } from '@/lib/validation';
import Team from './Team';
import Developers from './Developers';
import Subscription from './Subscription';

const ALL: [string, string[]][] = [
  ['Business', ['business.edit']],
  ['Team', ['team.manage']],
  ['Developers', ['developer.manage']],
  ['Plan & billing', ['plan.manage']],
];

export default function Settings({ me }: { me: any }) {
  const tabs = ALL.filter(([, p]) => p.some((x) => me.perms.includes(x))).map(([t]) => t);
  const [tab, setTab] = useState(tabs[0]);
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [f, setF] = useState({ address: '', phone: '', email: '', website: '' });
  useEffect(() => {
    setF({
      address: me.biz.addr || '',
      phone: local(me.biz.phone),
      email: me.biz.email || '',
      website: me.biz.website || '',
    });
  }, [me.biz?.name]);
  return (
    <div className="split" style={{ gridTemplateColumns: '210px 1fr' }}>
      <div>
        {tabs.map((x) => (
          <div key={x} className={'msg' + (tab === x ? ' on' : '')} onClick={() => setTab(x)}>
            <b>{x}</b>
          </div>
        ))}
      </div>
      <div className="card">
        {tab === 'Business' && (
          <>
            <h3>Business profile</h3>
            <div className="row">
              <div>
                <label>Registered name (locked after verification)</label>
                <input value={me.biz.name} readOnly />
              </div>
              <div>
                <label>Business type</label>
                <input value={me.biz.type} readOnly />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Business address</label>
                <input
                  value={f.address}
                  onChange={(e) => setF({ ...f, address: e.target.value })}
                />
              </div>
              <div>
                <label>Website (optional)</label>
                <input
                  value={f.website}
                  placeholder="https://druktrails.bt"
                  onChange={(e) => setF({ ...f, website: e.target.value })}
                />
              </div>
            </div>
            <div className="row">
              <div>
                <PhoneInput
                  label="Business contact number"
                  value={f.phone}
                  onChange={(v) => setF({ ...f, phone: v })}
                />
              </div>
              <div>
                <label>Business email</label>
                <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
            </div>
            <p>
              <button
                disabled={
                  !LOCAL_MOBILE_RE.test(f.phone) || !EMAIL_RE.test(f.email) || !f.address.trim()
                }
                onClick={() =>
                  run(
                    () =>
                      api('business', 'PATCH', { ...f, phone: full(f.phone) }).then(() =>
                        refreshAll(),
                      ),
                    'Business profile saved',
                  )
                }
              >
                Save
              </button>
            </p>
          </>
        )}
        {tab === 'Team' && <Team goPlan={() => setTab('Plan & billing')} />}
        {tab === 'Developers' && <Developers />}
        {tab === 'Plan & billing' && <Subscription />}
        {!tabs.length && <p>Your role has no settings to manage.</p>}
      </div>
      <Toast m={msg} />
    </div>
  );
}
