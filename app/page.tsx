'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Public, PasswordField, useRun, useToast, Toast } from '@/components/ui';
import { api } from '@/lib/api';

const DEMO: [string, string][] = [
  ['owner@druktrails.bt', 'Merchant owner (Gold plan, all permissions)'],
  ['tshewang@druktrails.bt', 'Merchant finance'],
  ['dorji@druktrails.bt', 'Merchant developer'],
  ['sonam@druktrails.bt', 'Merchant support'],
  ['operator@globalpay.bt', 'GlobalPay operator'],
  ['admin@globalpay.bt', 'GlobalPay admin'],
];

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('auth/login', 'POST', { email, password });
      router.push(r.home);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Public>
      <div className="hero">
        <div className="box">
          <div>
            <h1>One signup. Every payment.</h1>
            <p style={{ fontSize: 19, color: 'var(--mut)', maxWidth: 480 }}>
              Accept Nu. bank payments and international cards through one platform. Banks approve;
              GlobalPay connects. We never hold your money.
            </p>
            <p>
              <Link className="btn" href="/register">
                Open merchant account
              </Link>
            </p>
          </div>
          <div className="card" style={{ boxShadow: '0 20px 50px #16330018' }}>
            <h3>Sign in</h3>
            <label>Email</label>
            <input
              value={email}
              placeholder="you@company.bt"
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField value={password} onChange={setPassword} auto="current-password" />
            {error && (
              <div className="err" style={{ marginTop: 8 }}>
                {error}
              </div>
            )}
            <p>
              <button disabled={!email || !password || busy} onClick={submit}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </p>
            <hr />
            <small>
              Demo accounts (password <b>Demo@12345</b>). Click one to fill it in:
            </small>
            {DEMO.map(([e, d]) => (
              <div key={e}>
                <button
                  className="link"
                  onClick={() => {
                    setEmail(e);
                    setPassword('Demo@12345');
                  }}
                >
                  {e}
                </button>{' '}
                <small>{d}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Public>
  );
}
