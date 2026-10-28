'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Public, PasswordField, PhoneInput, full } from '@/components/ui';
import { api } from '@/lib/api';
import { EMAIL_RE, LOCAL_MOBILE_RE, passwordProblems } from '@/lib/validation';

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const emailOk = EMAIL_RE.test(email);
  const ready =
    name.trim().length > 1 &&
    emailOk &&
    LOCAL_MOBILE_RE.test(mobile) &&
    !passwordProblems(password).length &&
    terms;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('auth/register', 'POST', {
        name,
        email,
        mobile: full(mobile),
        password,
        emailConsent: consent,
      });
      router.push(r.home);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Public>
      <div className="main" style={{ margin: '0 auto', maxWidth: 560 }}>
        <h2>Create your account</h2>
        <p>
          <small>Step 1 of 2. Next you can register your business and become a merchant.</small>
        </p>
        <div className="card">
          <label>Full name</label>
          <input
            value={name}
            placeholder="Karma Wangchuk"
            onChange={(e) => setName(e.target.value)}
          />
          <label>Email</label>
          <input
            value={email}
            placeholder="karma@druktrails.bt"
            onChange={(e) => setEmail(e.target.value)}
          />
          {email && !emailOk && (
            <div className="err">Enter a valid email address, for example karma@druktrails.bt</div>
          )}
          <PhoneInput value={mobile} onChange={setMobile} />
          <PasswordField value={password} onChange={setPassword} rules />

          <div className="consent">
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                <b>Email notifications.</b> Send me notifications by email at{' '}
                {email || 'my registered email'}: the same messages that appear in my account about
                applications, documents, payments, subscriptions and support. I can change this any
                time under Profile, Preferences.
              </span>
            </label>
          </div>
          <div className="consent">
            <label>
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>I accept the Terms of Use and Privacy Policy *</span>
            </label>
          </div>
          {error && <div className="err">{error}</div>}
          <p>
            <button disabled={!ready || busy} onClick={create}>
              {busy ? 'Creating…' : 'Create account'}
            </button>
            <Link href="/" style={{ marginLeft: 12 }}>
              Already registered? Sign in
            </Link>
          </p>
        </div>
      </div>
    </Public>
  );
}
