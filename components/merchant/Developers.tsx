'use client';
import { useState } from 'react';
import { Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, fmtDate } from '@/lib/api';

/** A test key and a live key. A key is shown once when created; only its hash is stored. */
export default function Developers() {
  const { data, mutate } = useApi<any>('keys');
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [msg, toast] = useToast();
  const run = useRun(toast);
  if (!data) return null;
  const roll = async (mode: 'test' | 'live') => {
    if (
      !confirm(
        `Create a new ${mode} secret key? The current ${mode} key stops working immediately.`,
      )
    )
      return;
    const r = await run(async () => {
      const k = await api('keys', 'POST', { mode });
      await mutate();
      return k;
    }, `New ${mode} key created. Copy it now.`);
    if (r && r !== true) setFresh({ ...fresh, [mode]: r.key });
  };
  return (
    <>
      <h3>API keys</h3>
      <div className="row">
        {(['test', 'live'] as const).map((mode) => {
          const k = data.keys.find((x: any) => x.mode === mode);
          const blocked = mode === 'live' && !data.liveAllowed;
          return (
            <div key={mode} className="card" style={{ background: 'var(--soft)', border: 0 }}>
              <b>{mode === 'test' ? 'Test secret key' : 'Live secret key'}</b>
              <p style={{ margin: '4px 0' }}>
                <small>
                  {mode === 'test'
                    ? 'For trying things out. No real money moves.'
                    : 'For real payments. Keep it private and never put it in a web page.'}
                </small>
              </p>
              <input
                readOnly
                value={
                  fresh[mode] ||
                  (k
                    ? k.prefix + '••••••••••••••••'
                    : blocked
                      ? 'Available once a provider approves you'
                      : 'No key yet')
                }
              />
              {k && !fresh[mode] && (
                <small>
                  Created {fmtDate(k.at)}. For safety the full key cannot be shown again.
                </small>
              )}
              {fresh[mode] && (
                <div className="note warn" style={{ marginTop: 8 }}>
                  Copy this key now. You will not be able to see it again.
                </div>
              )}
              <p style={{ display: 'flex', gap: 8 }}>
                <button disabled={blocked} onClick={() => roll(mode)}>
                  {k ? 'Roll key' : 'Create key'}
                </button>
                {fresh[mode] && (
                  <button
                    className="alt"
                    onClick={() => {
                      navigator.clipboard?.writeText(fresh[mode]);
                      toast('Copied');
                    }}
                  >
                    Copy key
                  </button>
                )}
              </p>
            </div>
          );
        })}
      </div>
      <Toast m={msg} />
    </>
  );
}
