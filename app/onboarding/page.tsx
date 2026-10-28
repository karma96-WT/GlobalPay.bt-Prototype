'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header, Footer } from '@/components/ui';
import { useMe } from '@/lib/api';

export default function Onboarding() {
  const router = useRouter();
  const { data: me, error } = useMe();
  useEffect(() => {
    if (error?.status === 401) router.replace('/');
    else if (me && me.scope !== 'merchant') router.replace(me.home);
  }, [me, error, router]);
  if (!me) return <Header />;
  const started = me.stage !== 'new';
  const steps: [string, boolean][] = [
    ['Create account', true],
    ['Register your business', started],
    ['Choose payment providers and add documents', started],
    ['Provider approval, then go live', me.stage === 'merchant'],
  ];
  return (
    <>
      <Header me={me} home="/onboarding" logoutOnly />
      <div className="main" style={{ margin: '0 auto', maxWidth: 760 }}>
        <h2>Welcome, {me.name.split(' ')[0]}</h2>
        <p style={{ fontSize: 18, color: 'var(--mut)' }}>
          Your account is ready. To accept payments you need to register your business and be
          approved by a payment provider. Until then you cannot receive payments.
        </p>
        <div className="card hov">
          <h3>Register your business</h3>
          <p>
            Tell us about your business, choose your payment providers and add your documents. It
            takes about 10 minutes, and the same documents work for every provider.
          </p>
          <p>
            {started ? (
              <Link className="btn" href="/merchant/dashboard">
                Go to your dashboard
              </Link>
            ) : (
              <Link className="btn" href="/onboarding/business">
                Get started
              </Link>
            )}
          </p>
        </div>
        <div className="card">
          <h3>Your progress</h3>
          {steps.map(([t, d]) => (
            <div className="line" key={t}>
              <span>
                {d ? '✔' : '○'} {t}
              </span>
              <span className={'badge ' + (d ? 'b-ok' : '')}>{d ? 'Done' : 'To do'}</span>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </>
  );
}
