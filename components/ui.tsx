'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError, refreshAll, useApi, useMe, money, fmtDate } from '@/lib/api';
import { PW_RULES, LOCAL_MOBILE_RE } from '@/lib/validation';
import { calc, chargeName } from '@/lib/calc';

// ---------- small pieces ----------
const GOOD = /Approved|Successful|Verified|Active|Paid|Resolved|Sent/;
const BAD = /Reject|Fail|Deactiv|Expired|Cancel|Returned/;
const WARN = /Pending|Waiting|Correction|Refund|Open|Unpaid|Uploaded|In progress|Queued/;
export const tone = (s: string) =>
  GOOD.test(s) ? 'b-ok' : BAD.test(s) ? 'b-bad' : WARN.test(s) ? 'b-warn' : '';
export const Badge = ({ s }: { s: string }) => <span className={'badge ' + tone(s)}>{s}</span>;
export const Stat = ({ n, l }: { n: any; l: string }) => (
  <div className="card stat hov">
    <b>{n}</b>
    <span>{l}</span>
  </div>
);
export const Sw = ({
  on,
  set,
  disabled,
}: {
  on: boolean;
  set: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    aria-pressed={on}
    disabled={disabled}
    className={'sw' + (on ? ' on' : '')}
    onClick={() => set(!on)}
  />
);
export const Acc = ({ open, children }: { open: boolean; children: any }) => (
  <div className={'acc' + (open ? ' open' : '')}>
    <div>{children}</div>
  </div>
);
export const Toast = ({ m }: { m: string }) => (m ? <div className="toast">{m}</div> : null);
export function useToast(): [string, (m: string) => void] {
  const [m, set] = useState('');
  return [
    m,
    (t: string) => {
      set(t);
      setTimeout(() => set(''), 3200);
    },
  ];
}
/** Run a server action, show the result as a toast, and refresh what is on screen. */
export function useRun(toast: (m: string) => void) {
  return async (fn: () => Promise<any>, ok = 'Done') => {
    try {
      const r = await fn();
      toast(ok);
      refreshAll();
      return r ?? true;
    } catch (e: any) {
      toast(e instanceof ApiError ? e.message : 'Something went wrong');
      return null;
    }
  };
}
export const Modal = ({ onClose, children }: { onClose: () => void; children: any }) => (
  <div className="modal" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);
export const Empty = ({ children }: { children: any }) => (
  <p style={{ color: 'var(--mut)', padding: 12 }}>{children}</p>
);

// ---------- password with eye button and live rules ----------
const Eye = ({ off }: { off: boolean }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);
export function PasswordField({
  value,
  onChange,
  label = 'Password',
  rules = false,
  auto = 'new-password',
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  rules?: boolean;
  auto?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <label>{label}</label>
      <div className="pw">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          autoComplete={auto}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow(!show)}
        >
          <Eye off={show} />
        </button>
      </div>
      {rules &&
        value.length > 0 &&
        PW_RULES.map(([t, r]) => (
          <div key={t} className={'rule ' + (r.test(value) ? 'ok' : 'no')}>
            {r.test(value) ? '✔' : '✖'} {t}
          </div>
        ))}
    </>
  );
}

// ---------- mobile number: +975 is fixed, the person types 17, 16 or 77 and six digits ----------
export function PhoneInput({
  value,
  onChange,
  label = 'Mobile number',
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
}) {
  const bad = value.length > 0 && !LOCAL_MOBILE_RE.test(value);
  return (
    <>
      <label>
        {label}
        {required && ' *'}
      </label>
      <div className="phone">
        <span>+975</span>
        <input
          inputMode="numeric"
          maxLength={8}
          placeholder="17123456"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
        />
      </div>
      {bad && (
        <div className="err">Start with 17, 16 or 77, then six digits (8 digits in total)</div>
      )}
    </>
  );
}
export const full = (local: string) => (local ? '+975' + local : '');
export const local = (m?: string) => (m || '').replace('+975', '');

// ---------- header, footer, public wrapper ----------
const Bell = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
export function Header({
  home = '/',
  me,
  bell = 0,
  base = '',
  settings = false,
  logoutOnly = false,
}: {
  home?: string;
  me?: any;
  bell?: number;
  base?: string;
  settings?: boolean;
  logoutOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const logout = async () => {
    await api('auth/logout', 'POST').catch(() => {});
    refreshAll();
    router.push('/');
  };
  return (
    <header className="hdr">
      <Link className="logo" href={home}>
        <i>G</i>GlobalPay.bt
      </Link>
      <div className="sp" />
      {me ? (
        <>
          {base ? (
            <Link className="bell" href={`${base}/notifications`} aria-label="Notifications">
              <Bell />
              {bell > 0 && <b>{bell}</b>}
            </Link>
          ) : null}
          {!logoutOnly && (
            <div className="dd ">
              <button
                className="flex justify-center"
                aria-label="Profile menu"
                onClick={() => setOpen(!open)}
              >
                {me.name
                  .split(' ')
                  .map((x: string) => x[0])
                  .join('')
                  .slice(0, 2)}
              </button>
              {open && (
                <div className="menu" onClick={() => setOpen(false)}>
                  <div style={{ padding: '8px 12px' }}>
                    <b>{me.name}</b>
                    <br />
                    <small>{me.roleName}</small>
                  </div>
                  <hr />
                  <Link href={`${base}/profile`}>Profile management</Link>
                  {settings && <Link href={`${base}/settings`}>Settings</Link>}
                  {me.scope === 'merchant' && me.perms.includes('report.export') && (
                    <Link href="/merchant/reports">Statements</Link>
                  )}
                  <a href="#help">Help &amp; Support</a>
                </div>
              )}
            </div>
          )}
          <button onClick={logout}>Log out</button>
        </>
      ) : (
        <>
          <Link className="btn alt" href="/">
            Sign in
          </Link>
          <Link className="btn" href="/register">
            Open account
          </Link>
        </>
      )}
    </header>
  );
}

export function Footer() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  return (
    <footer className="ftr" id="help">
      <div className="g">
        <div>
          <div className="logo" style={{ color: '#fff' }}>
            <i style={{ color: 'var(--forest)' }}>G</i>GlobalPay.bt
          </div>
          <p>
            One signup, every Bhutanese payment channel. GlobalPay.bt is not a bank and never holds
            your funds or sees card details.
          </p>
        </div>
        <div>
          <h4>Help &amp; Support</h4>
          <a href="mailto:support@cloudbhutan.com">support@cloudbhutan.com</a>
          <a href="#">FAQs</a>
          <button className="link" style={{ color: '#d4e8c4' }} onClick={() => setOpen(true)}>
            Give feedback
          </button>
        </div>
        <div>
          <h4>Legal &amp; Privacy</h4>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Use</a>
          <a href="#">Disclosures</a>
          <a href="#">Cookie settings</a>
        </div>
        <div>
          <h4>Settlement reference</h4>
          <p style={{ margin: 0 }}>
            Local payments settle via the RMA national payment system (SWIFT: RMABBTBT). Funds go
            directly to your own bank account.
          </p>
        </div>
      </div>
      <div className="c">
        © 2026 GlobalPay.bt · A Cloud Bhutan project · College of Science and Technology, Royal
        University of Bhutan. Prototype: figures are indicative.
      </div>
      {open && <FeedbackModal signedIn={!!me} onClose={() => setOpen(false)} />}
    </footer>
  );
}

function FeedbackModal({ signedIn, onClose }: { signedIn: boolean; onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  return (
    <Modal onClose={onClose}>
      <h3>Feedback for the GlobalPay.bt team</h3>
      {!signedIn ? (
        <p>Please sign in to send feedback. It goes to the platform admin team.</p>
      ) : (
        <>
          <label>Subject</label>
          <input
            value={subject}
            placeholder="What is this about?"
            onChange={(e) => setSubject(e.target.value)}
          />
          <label>Your feedback</label>
          <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          <p style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={!subject.trim() || !body.trim()}
              onClick={async () => {
                if (
                  await run(
                    () =>
                      api('tickets', 'POST', {
                        kind: 'feedback',
                        subject,
                        body,
                        category: 'Feedback',
                      }),
                    'Thank you. Your feedback was sent to the admin team.',
                  )
                )
                  onClose();
              }}
            >
              Send feedback
            </button>
            <button className="alt" onClick={onClose}>
              Cancel
            </button>
          </p>
        </>
      )}
      <Toast m={msg} />
    </Modal>
  );
}
export const Public = ({ children }: { children: any }) => {
  const { data: me } = useMe();
  return (
    <>
      <Header me={me} home={me?.home || '/'} />
      {children}
      <Footer />
    </>
  );
};
export const PayHead = () => (
  <header className="hdr">
    <span className="logo">
      <i>G</i>GlobalPay.bt
    </span>
    <div className="sp" />
    <span className="badge b-ok">Secure payment</span>
  </header>
);

// ---------- the signed-in workspace: sidebar of tabs, only the tabs the role may use ----------
export type MenuItem = [key: string, label: string, perms: string[] | null];
export function Shell({
  portal,
  menu,
  children,
}: {
  portal: 'merchant' | 'operator' | 'admin';
  menu: MenuItem[];
  children: (ctx: { me: any; tab: string }) => any;
}) {
  const { tab } = useParams() as { tab: string };
  const { data: me, error, isLoading } = useMe();
  const router = useRouter();
  const wrongPortal =
    me &&
    (portal === 'merchant'
      ? me.scope !== 'merchant'
      : portal === 'admin'
        ? me.roleCode !== 'ADMIN'
        : me.roleCode !== 'OPERATOR');
  useEffect(() => {
    if (error?.status === 401) router.replace('/');
    else if (me?.mustChange) router.replace('/change-password');
    else if (me && wrongPortal) router.replace(me.home);
    else if (me?.scope === 'merchant' && me.stage === 'new') router.replace('/onboarding');
  }, [me, error, wrongPortal, router]);
  if (isLoading || !me || wrongPortal || me.mustChange)
    return (
      <>
        <Header />
        <div className="main">
          <p>Loading…</p>
        </div>
      </>
    );

  const allowed = menu.filter(([, , p]) => !p || p.some((x) => me.perms.includes(x)));
  const current = menu.find((m) => m[0] === tab);
  const denied = current && current[2] && !current[2].some((x) => me.perms.includes(x));
  const canSettings = allowed.some((m) => m[0] === 'settings');
  return (
    <>
      <Header me={me} home={me.home} bell={me.unread} base={'/' + portal} settings={canSettings} />
      <div className="shell">
        <aside className="side">
          <small>{me.roleName} workspace</small>
          {allowed.map(([k, l]) => (
            <Link key={k} href={`/${portal}/${k}`} className={tab === k ? 'on' : ''}>
              {l}
              {k === 'notifications' && me.unread > 0 && (
                <span className="badge n">{me.unread}</span>
              )}
            </Link>
          ))}
        </aside>
        <main className="main" key={tab}>
          <h2>{current?.[1]}</h2>
          {denied || !current ? (
            <div className="note warn">
              Your role ({me.roleName}) does not include access to this page.
            </div>
          ) : (
            children({ me, tab })
          )}
        </main>
      </div>
      <Footer />
    </>
  );
}

// ---------- invoice, shown the same way to the merchant and the customer ----------
export function InvoiceView({ iv }: { iv: any }) {
  const c = calc(iv.items, iv.charges);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 18,
        padding: 20,
        margin: '12px 0',
      }}
    >
      <div className="line" style={{ border: 0, padding: 0 }}>
        <div>
          <h3 style={{ margin: 0 }}>Invoice {iv.no || '(draft)'}</h3>
          <small>Issued {fmtDate(iv.date)} · Provider: RMA</small>
        </div>
        <Badge s={iv.status || 'Unpaid'} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div className="bill">
          <small>Bill from</small>
          <br />
          <b>{iv.merchant.name}</b>
          <br />
          {iv.merchant.addr}
          <br />
          {iv.merchant.phone} · {iv.merchant.email}
        </div>
        <div className="bill">
          <small>Bill to</small>
          <br />
          <b>{iv.cust.name || '—'}</b>
          <br />
          {iv.cust.email || '—'}
          <br />
          {iv.cust.mobile || '—'}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Discount</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {iv.items.map((i: any, n: number) => (
            <tr key={n}>
              <td>{i.d}</td>
              <td>{i.q}</td>
              <td>{money(i.p * 100)}</td>
              <td>{c.lines[n].disc ? '−' + money(c.lines[n].disc) : '—'}</td>
              <td>{money(c.lines[n].net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 8 }}>
        Subtotal {money(c.net)}
        <br />
        {c.charges.map((x, n) => (
          <span key={n}>
            {chargeName(x)}
            {x.mode === 'pct' ? ` (${x.v}%)` : ''} {money(x.amount)}
            <br />
          </span>
        ))}
        <b style={{ fontSize: 20 }}>Grand total {money(c.total)}</b>
      </div>
      {iv.notes && (
        <p>
          <small>Notes / terms: {iv.notes}</small>
        </p>
      )}
      {iv.txnRef && (
        <p>
          <small>
            Transaction reference: {iv.txnRef} · Paid {fmtDate(iv.paidAt)}
          </small>
        </p>
      )}
    </div>
  );
}

// ---------- choose a file from the computer ----------
export function FileSlot({
  label,
  file,
  onFile,
}: {
  label: string;
  file?: File;
  onFile: (f?: File) => void;
}) {
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  const id = 'f' + label.replace(/\W/g, '');
  const take = (f?: File) => {
    if (!f) return;
    if (!/(pdf|jpe?g|png)$/i.test(f.name)) return setErr('Only PDF, JPG or PNG files');
    if (f.size > 4 * 1024 * 1024) return setErr('File is over 4 MB');
    setErr('');
    onFile(f);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      {!file ? (
        <label
          htmlFor={id}
          className={'drop' + (over ? ' over' : '')}
          style={{ display: 'block', margin: 0 }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files[0]);
          }}
        >
          Drop a file here or <u>browse</u>
          <br />
          <small>PDF, JPG or PNG, up to 4 MB</small>
        </label>
      ) : (
        <div
          className="line"
          style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '10px 14px' }}
        >
          <div>
            <b>{file.name}</b> <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn alt" href={URL.createObjectURL(file)} target="_blank">
              View
            </a>
            <label
              htmlFor={id}
              className="btn alt"
              style={{ margin: 0, cursor: 'pointer', color: 'var(--ink)', fontSize: 16 }}
            >
              Replace
            </label>
            <button className="alt" onClick={() => onFile(undefined)}>
              Remove
            </button>
          </div>
        </div>
      )}
      <input
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {err && <div className="err">{err}</div>}
    </div>
  );
}

// ---------- profile (every role) ----------
export function Profile() {
  const { data: me, mutate } = useMe();
  const [tab, setTab] = useState('Personal');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [consent, setConsent] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const { data: sessions } = useApi<any[]>(tab === 'Sessions' ? 'sessions' : null);
  useEffect(() => {
    if (me) {
      setName(me.name);
      setMobile(local(me.mobile));
      setConsent(me.emailConsent);
    }
  }, [me?.id]);
  if (!me) return null;
  const ok = PW_RULES.every(([, r]) => r.test(next));
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div className="av lg">
          {me.name
            .split(' ')
            .map((x: string) => x[0])
            .join('')
            .slice(0, 2)}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>{me.name}</h3>
          <small>
            {me.email} · {me.roleName}
            {me.business && ` · ${me.business}`}
          </small>
        </div>
      </div>
      <div className="tabs">
        {['Personal', 'Security', 'Sessions', 'Preferences'].map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {x}
          </button>
        ))}
      </div>
      <div className="card">
        {tab === 'Personal' && (
          <>
            <div className="row">
              <div>
                <label>Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label>Email (sign-in)</label>
                <input value={me.email} readOnly />
              </div>
            </div>
            <div className="row">
              <div>
                <PhoneInput value={mobile} onChange={setMobile} />
              </div>
              <div>
                <label>Role</label>
                <input value={me.roleName} readOnly />
              </div>
            </div>
            <p>
              <button
                disabled={name.trim().length < 2 || !/^(17|16|77)\d{6}$/.test(mobile)}
                onClick={() =>
                  run(async () => {
                    await api('me', 'PATCH', { name, mobile: full(mobile), emailConsent: consent });
                    mutate();
                  }, 'Profile saved')
                }
              >
                Save changes
              </button>
            </p>
          </>
        )}
        {tab === 'Security' && (
          <>
            <h3>Change password</h3>
            <div className="row">
              <div>
                <PasswordField
                  label="Current password"
                  value={cur}
                  onChange={setCur}
                  auto="current-password"
                />
              </div>
              <div>
                <PasswordField label="New password" value={next} onChange={setNext} rules />
              </div>
            </div>
            <p>
              <button
                disabled={!cur || !ok}
                onClick={async () => {
                  if (
                    await run(
                      () => api('auth/password', 'POST', { current: cur, next }),
                      'Password updated',
                    )
                  ) {
                    setCur('');
                    setNext('');
                  }
                }}
              >
                Update password
              </button>
            </p>
          </>
        )}
        {tab === 'Sessions' &&
          (sessions || []).map((s) => (
            <div className="line" key={s.id}>
              <div>
                <b>{s.device.slice(0, 60)}</b>
                <br />
                <small>
                  {s.ip || 'unknown IP'} · last active {fmtDate(s.at)}
                </small>
              </div>
              {s.current ? (
                <span className="badge b-ok">This device</span>
              ) : (
                <button
                  className="alt"
                  onClick={() => run(() => api('sessions/' + s.id, 'DELETE'), 'Signed out')}
                >
                  Sign out
                </button>
              )}
            </div>
          ))}
        {tab === 'Preferences' && (
          <>
            <div className="line">
              <div>
                <b>Email notifications</b>
                <br />
                <small>Receive the same messages you see under Notifications at {me.email}</small>
              </div>
              <Sw
                on={consent}
                set={(v) => {
                  setConsent(v);
                  run(
                    () =>
                      api('me', 'PATCH', { name, mobile: me.mobile, emailConsent: v }).then(() =>
                        mutate(),
                      ),
                    v ? 'Email notifications on' : 'Email notifications off',
                  );
                }}
              />
            </div>
            <div className="row">
              <div>
                <label>Language</label>
                <select>
                  <option>English</option>
                </select>
              </div>
              <div>
                <label>Time zone</label>
                <select>
                  <option>Asia/Thimphu (UTC+6)</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
      <Toast m={msg} />
    </>
  );
}
