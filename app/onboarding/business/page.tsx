'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header, Footer, FileSlot, PhoneInput, full } from '@/components/ui';
import { api, refreshAll, useMe } from '@/lib/api';
import { PROVIDER_DOCS, docsFor } from '@/lib/providers';
import { CID_RE, EMAIL_RE, LOCAL_MOBILE_RE } from '@/lib/validation';

const STEPS = ['Business', 'Providers', 'Documents', 'Declarations'];
const TYPES = ['Private limited', 'Sole proprietor', 'Government office'];

/** Draft legal wording. The CEO / legal adviser finalises this before launch. */
const LEGAL = [
  [
    'Terms of Use (summary)',
    'GlobalPay.bt connects your business to payment providers such as RMA and Bank of Bhutan. It does not hold your money, and it does not approve any provider service: each provider decides on your application. You are responsible for the accuracy of what you submit, for the goods and services you invoice, and for keeping your sign-in details safe. GlobalPay.bt may suspend an account that is used for unlawful activity or whose information is found to be false.',
  ],
  [
    'Privacy notice (summary)',
    'We collect your business and representative details, your documents and the records of payments made through your account. We use them to review your application, forward it to the providers you choose, operate your account and meet legal obligations. Your documents and details are shared only with the providers you select. They are stored securely and kept for as long as the law and our agreements require. You may ask us to correct your information.',
  ],
  [
    'Provider consent',
    'By submitting, you allow GlobalPay.bt operators to view your documents, check them for completeness and send them to the selected payment providers, who will process them under their own terms.',
  ],
];

export default function RegisterBusiness() {
  const router = useRouter();
  const { data: me, error } = useMe();
  const [s, setS] = useState(0);
  const [b, setB] = useState({
    name: '',
    type: 'Private limited',
    license: '',
    address: '',
    repName: '',
    repCid: '',
    phone: '',
    email: '',
    website: '',
    tech: '',
  });
  const [prov, setProv] = useState<string[]>([]);
  const [mode, setMode] = useState<'docs' | 'cred'>('docs');
  const [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [c, setC] = useState({
    accuracy: false,
    providers: false,
    terms: false,
    privacy: false,
    email: false,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (error?.status === 401) router.replace('/');
    else if (me && (me.scope !== 'merchant' || me.stage !== 'new')) router.replace(me.home);
    else if (me) setC((x) => ({ ...x, email: me.emailConsent }));
  }, [me?.id, error]);
  if (!me) return <Header />;

  const set = (k: string) => (e: any) => setB({ ...b, [k]: e.target.value });
  const needs = (p: string) => docsFor(p, b.type);
  const valid = [
    b.name.trim() &&
      b.license.trim() &&
      b.address.trim() &&
      b.repName.trim() &&
      CID_RE.test(b.repCid) &&
      LOCAL_MOBILE_RE.test(b.phone) &&
      EMAIL_RE.test(b.email),
    prov.length > 0,
    mode === 'cred'
      ? prov.every((p) => creds[p]?.trim())
      : prov.every((p) => needs(p).every((d) => files[p + '|' + d])),
    c.accuracy && c.providers && c.terms && c.privacy,
  ][s];

  const toggle = (p: string, on: boolean) => {
    setProv(on ? [...prov, p] : prov.filter((x) => x !== p));
    if (!on)
      setFiles(Object.fromEntries(Object.entries(files).filter(([k]) => !k.startsWith(p + '|'))));
  };
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const f = new FormData();
      f.set(
        'meta',
        JSON.stringify({
          business: { ...b, phone: full(b.phone) },
          providers: prov,
          route: mode,
          creds,
          consent: c,
        }),
      );
      if (mode === 'docs')
        for (const p of prov)
          for (const d of needs(p)) f.set(`${p}|${d}`, files[p + '|' + d] as File);
      await api('business', 'POST', f);
      await refreshAll();
      router.push('/merchant/applications');
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <Header me={me} home="/onboarding" logoutOnly />
      <div className="main" style={{ margin: '0 auto', maxWidth: 780 }}>
        <h2>Register your business</h2>
        <div className="stepper">
          {STEPS.map((t, i) => (
            <span key={t} className={i === s ? 'on' : i < s ? 'done' : ''}>
              {i + 1}. {t}
            </span>
          ))}
        </div>

        {s === 0 && (
          <>
            <div className="card">
              <h3>Business details</h3>
              <small>As shown on your trade licence.</small>
              <div className="row">
                <div>
                  <label>Registered business name *</label>
                  <input value={b.name} placeholder="Druk Trails Pvt Ltd" onChange={set('name')} />
                </div>
                <div>
                  <label>Business type *</label>
                  <select value={b.type} onChange={set('type')}>
                    {TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row">
                <div>
                  <label>Trade licence or registration number *</label>
                  <input value={b.license} placeholder="TL-2019-04417" onChange={set('license')} />
                </div>
                <div>
                  <label>Business address *</label>
                  <input
                    value={b.address}
                    placeholder="Norzin Lam, Thimphu"
                    onChange={set('address')}
                  />
                </div>
              </div>
            </div>
            <div className="card">
              <h3>Authorised representative</h3>
              <small>The person who can legally act for the business.</small>
              <div className="row">
                <div>
                  <label>Full name *</label>
                  <input value={b.repName} placeholder="Karma Wangchuk" onChange={set('repName')} />
                </div>
                <div>
                  <label>Citizenship ID (CID) number *</label>
                  <input
                    value={b.repCid}
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="11005001234"
                    onChange={(e) => setB({ ...b, repCid: e.target.value.replace(/\D/g, '') })}
                  />
                  {b.repCid && !CID_RE.test(b.repCid) && (
                    <div className="err">The CID has 11 digits</div>
                  )}
                </div>
              </div>
            </div>
            <div className="card">
              <h3>Contact</h3>
              <div className="row">
                <div>
                  <PhoneInput
                    label="Business contact number"
                    required
                    value={b.phone}
                    onChange={(v) => setB({ ...b, phone: v })}
                  />
                </div>
                <div>
                  <label>Business email *</label>
                  <input
                    value={b.email}
                    placeholder="accounts@druktrails.bt"
                    onChange={set('email')}
                  />
                  {b.email && !EMAIL_RE.test(b.email) && (
                    <div className="err">Enter a valid email</div>
                  )}
                </div>
              </div>
              <div className="row">
                <div>
                  <label>Website (optional)</label>
                  <input
                    value={b.website}
                    placeholder="https://druktrails.bt"
                    onChange={set('website')}
                  />
                  <small>
                    Leave blank if you do not sell through a website. You can still use payment
                    links.
                  </small>
                </div>
                <div>
                  <label>Technical contact (optional)</label>
                  <input
                    value={b.tech}
                    placeholder="Dorji Penjor, dorji@druktrails.bt"
                    onChange={set('tech')}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {s === 1 && (
          <div className="card">
            <h3>Payment providers</h3>
            {Object.entries(PROVIDER_DOCS).map(([code, p]) => (
              <label
                key={code}
                className="card hov"
                style={{ display: 'block', color: 'inherit', fontSize: 15, margin: '0 0 12px' }}
              >
                <input
                  type="checkbox"
                  checked={prov.includes(code)}
                  onChange={(e) => toggle(code, e.target.checked)}
                />{' '}
                <b>{p.name}</b>
                <br />
                <small>
                  {code === 'RMA'
                    ? 'Nu. payments from local bank accounts · charges per RMA schedule'
                    : 'Visa and Mastercard in INR and USD · MDR 3.5% per transaction'}
                </small>
              </label>
            ))}
            <small>
              Each provider you pick gets its own application. You will only be asked for the
              documents of the providers you select.
            </small>
          </div>
        )}

        {s === 2 && (
          <>
            <div className="tabs">
              <button className={mode === 'docs' ? 'on' : ''} onClick={() => setMode('docs')}>
                I have no credentials: upload documents
              </button>
              <button className={mode === 'cred' ? 'on' : ''} onClick={() => setMode('cred')}>
                I am already verified: enter my merchant ID
              </button>
            </div>
            {prov.map((p) => (
              <div key={p} className="card">
                <h3>{PROVIDER_DOCS[p].name}</h3>
                {mode === 'cred' ? (
                  <>
                    <label>Your existing merchant ID with {p}</label>
                    <input
                      value={creds[p] || ''}
                      placeholder={p === 'RMA' ? 'BE00000585' : 'Merchant ID'}
                      onChange={(e) => setCreds({ ...creds, [p]: e.target.value })}
                    />
                  </>
                ) : (
                  needs(p).map((d) => (
                    <FileSlot
                      key={d}
                      label={d}
                      file={files[p + '|' + d]}
                      onFile={(f) => setFiles({ ...files, [p + '|' + d]: f })}
                    />
                  ))
                )}
              </div>
            ))}
          </>
        )}

        {s === 3 && (
          <>
            <div className="card">
              <h3>Review</h3>
              <p>
                <b>{b.name}</b> ({b.type}) · {b.address}
                <br />
                Representative: {b.repName}
                <br />
                Providers: <b>{prov.join(', ')}</b> ·{' '}
                {mode === 'cred'
                  ? 'existing credentials'
                  : `${Object.values(files).filter(Boolean).length} documents`}
              </p>
            </div>
            <div className="card">
              <h3>Declarations and consent</h3>
              <div className="note warn">
                Draft wording for review. The CEO and legal adviser will finalise the legal text
                before launch.
              </div>
              <div className="legal">
                {LEGAL.map(([h, t]) => (
                  <div key={h}>
                    <b>{h}</b>
                    <p>{t}</p>
                  </div>
                ))}
              </div>
              {(
                [
                  [
                    'accuracy',
                    'I declare that the information and documents I have provided are true, complete and belong to this business. *',
                  ],
                  [
                    'providers',
                    'I authorise GlobalPay.bt to share my business details and documents with the payment providers I selected, for the purpose of my application. *',
                  ],
                  ['terms', 'I have read and accept the GlobalPay.bt Terms of Use. *'],
                  [
                    'privacy',
                    'I have read the Privacy Notice and consent to my information being processed as described. *',
                  ],
                  [
                    'email',
                    `Send me notifications by email at ${me.email} (the same messages shown in my account). Optional.`,
                  ],
                ] as [keyof typeof c, string][]
              ).map(([k, t]) => (
                <div className="consent" key={k}>
                  <label>
                    <input
                      type="checkbox"
                      checked={c[k]}
                      onChange={(e) => setC({ ...c, [k]: e.target.checked })}
                    />
                    <span>{t}</span>
                  </label>
                </div>
              ))}
            </div>
            {err && (
              <div className="err" style={{ marginBottom: 10 }}>
                {err}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            className="alt"
            disabled={busy}
            onClick={() => (s ? setS(s - 1) : router.push('/onboarding'))}
          >
            Back
          </button>
          {s < 3 ? (
            <button disabled={!valid} onClick={() => setS(s + 1)}>
              Continue
            </button>
          ) : (
            <button disabled={!valid || busy} onClick={submit}>
              {busy ? 'Submitting…' : 'Submit application'}
            </button>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
