'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, Footer, PasswordField } from '@/components/ui';
import { api, refreshAll, useMe } from '@/lib/api';
import { passwordProblems } from '@/lib/validation';

/** Shown the first time someone signs in with a password that another person set for them. */
export default function ChangePassword() {
  const router = useRouter();
  const { data: me, error } = useMe();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  if (error?.status === 401) router.replace('/');

  const save = async () => {
    try {
      const r = await api('auth/password', 'POST', { current: cur, next });
      await refreshAll();
      router.push(r.home);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  return (
    <>
      <Header me={me} logoutOnly />
      <div className="main" style={{ margin: '0 auto', maxWidth: 520 }}>
        <h2>Choose your own password</h2>
        <div className="note">
          {me?.name ? `Welcome, ${me.name.split(' ')[0]}. ` : ''}Your account was set up for you
          with a temporary password. For your security, choose a new one before you continue.
        </div>
        <div className="card">
          <PasswordField
            label="Temporary password"
            value={cur}
            onChange={setCur}
            auto="current-password"
          />
          <PasswordField label="New password" value={next} onChange={setNext} rules />
          {msg && <div className="err">{msg}</div>}
          <p>
            <button disabled={!cur || !!passwordProblems(next).length} onClick={save}>
              Save and continue
            </button>
          </p>
        </div>
      </div>
      <Footer />
    </>
  );
}
