'use client';
import { useState } from 'react';
import { Badge, Toast, useToast } from '@/components/ui';
import { Preview } from '@/components/Docs';
import { useApi, money, fmtDate, fmtTime, fmtSize } from '@/lib/api';

const Filters = ({
  q,
  setQ,
  placeholder,
  children,
}: {
  q: string;
  setQ: (v: string) => void;
  placeholder: string;
  children?: any;
}) => (
  <div className="filters">
    <input
      style={{ flex: 2 }}
      placeholder={placeholder}
      value={q}
      onChange={(e) => setQ(e.target.value)}
    />
    {children}
  </div>
);
const Sel = ({
  v,
  set,
  all,
  opts,
}: {
  v: string;
  set: (v: string) => void;
  all: string;
  opts: string[];
}) => (
  <select value={v} onChange={(e) => set(e.target.value)}>
    <option value="">{all}</option>
    {opts.map((o) => (
      <option key={o}>{o}</option>
    ))}
  </select>
);
const inDates = (d: string, from: string, to: string) =>
  (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);

export function Merchants() {
  const { data = [] } = useApi<any[]>('admin/merchants', 10000);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const rows = data.filter(
    (m) =>
      `${m.name} ${m.license} ${m.owner} ${m.ownerEmail} ${m.email}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!plan || m.plan === plan) &&
      (!status || m.status === status) &&
      (!type || m.type === type),
  );
  return (
    <>
      <Filters q={q} setQ={setQ} placeholder="Search by business, licence, owner or email">
        <Sel v={plan} set={setPlan} all="All plans" opts={['Basic', 'Gold', 'Premium']} />
        <Sel
          v={type}
          set={setType}
          all="All business types"
          opts={['Private limited', 'Sole proprietor', 'Government office']}
        />
        <Sel v={status} set={setStatus} all="All statuses" opts={['active', 'paused', 'closed']} />
      </Filters>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>Owner</th>
              <th>Plan</th>
              <th>Providers</th>
              <th>Members</th>
              <th>Sales volume</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <b>{m.name}</b>
                  <br />
                  <small>
                    {m.type} · {m.license}
                  </small>
                </td>
                <td>
                  {m.owner || '—'}
                  <br />
                  <small>{m.ownerEmail}</small>
                </td>
                <td>
                  {m.plan}
                  {m.periodEnd && (
                    <>
                      <br />
                      <small>until {fmtDate(m.periodEnd)}</small>
                    </>
                  )}
                </td>
                <td>
                  <small>{m.apps.replace(/:/g, ' ').split(', ').join(' · ') || '—'}</small>
                </td>
                <td>{m.members}</td>
                <td>{money(m.volume)}</td>
                <td>{fmtDate(m.createdAt)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7}>No merchants match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Applications() {
  const { data = [] } = useApi<any[]>('apps', 10000);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [prov, setProv] = useState('');
  const rows = data.filter(
    (a) =>
      `${a.id} ${a.who} ${a.op}`.toLowerCase().includes(q.toLowerCase()) &&
      (!status || a.status === status) &&
      (!prov || a.prov === prov),
  );
  return (
    <>
      <Filters q={q} setQ={setQ} placeholder="Search by application ID, applicant or operator">
        <Sel
          v={status}
          set={setStatus}
          all="All statuses"
          opts={['Pending', 'Correction required', 'Waiting', 'Approved', 'Rejected']}
        />
        <Sel v={prov} set={setProv} all="All providers" opts={['RMA', 'BoB']} />
      </Filters>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Applicant</th>
              <th>Provider</th>
              <th>Submitted</th>
              <th>Operator</th>
              <th>Documents</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.who}</td>
                <td>{a.prov}</td>
                <td>{fmtDate(a.date)}</td>
                <td>{a.op}</td>
                <td>
                  {a.route === 'cred'
                    ? 'Credentials'
                    : `${a.docs.filter((d: any) => d.state === 'Verified').length}/${a.docs.length} verified`}
                </td>
                <td>
                  <Badge s={a.status} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7}>No applications match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Every document on the platform, with the merchant and provider it belongs to. */
export function Documents() {
  const { data = [] } = useApi<any[]>('admin/documents', 10000);
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [prov, setProv] = useState('');
  const [view, setView] = useState<any>(null);
  const rows = data.filter(
    (d) =>
      `${d.merchant} ${d.doc} ${d.appId} ${d.file || ''}`.toLowerCase().includes(q.toLowerCase()) &&
      (!state || d.state === state) &&
      (!prov || d.prov === prov),
  );
  const counts = ['Uploaded', 'Verified', 'Returned'].map((s) => [
    s,
    data.filter((d) => d.state === s).length,
  ]);
  return (
    <>
      <div className="tabs">
        {counts.map(([s, n]) => (
          <button
            key={s}
            className={state === s ? 'on' : ''}
            onClick={() => setState(state === s ? '' : (s as string))}
          >
            {s} ({n})
          </button>
        ))}
      </div>
      <Filters q={q} setQ={setQ} placeholder="Search by merchant, document or file name">
        <Sel v={prov} set={setProv} all="All providers" opts={['RMA', 'BoB']} />
      </Filters>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Merchant</th>
              <th>Application</th>
              <th>File</th>
              <th>State</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.appId + d.doc}>
                <td>
                  <b>{d.doc}</b>
                </td>
                <td>{d.merchant}</td>
                <td>
                  {d.appId} · {d.prov}
                </td>
                <td>
                  {d.demo ? (
                    <small>Demo record</small>
                  ) : (
                    <>
                      <small>{d.file}</small>
                      <br />
                      <small>
                        {fmtSize(d.size)} · {fmtDate(d.at)}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  <Badge s={d.state} />
                  {d.note && (
                    <>
                      <br />
                      <small>{d.note}</small>
                    </>
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!d.demo && (
                    <>
                      <button className="alt" onClick={() => setView(d)}>
                        View
                      </button>{' '}
                      <a
                        className="btn alt"
                        href={`/api/files/${encodeURIComponent(d.appId)}/${encodeURIComponent(d.doc)}?download=1`}
                      >
                        Download
                      </a>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6}>No documents match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {view && (
        <Preview appId={view.appId} doc={view.doc} name={view.file} onClose={() => setView(null)} />
      )}
    </>
  );
}

export function Transactions() {
  const { data = [] } = useApi<any[]>('admin/transactions', 10000);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [prov, setProv] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = data.filter(
    (t) =>
      `${t.id} ${t.merchant} ${t.customer} ${t.invoiceNo || ''} ${t.providerTxnId || ''}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (!status || t.status === status) &&
      (!prov || t.prov === prov) &&
      (!kind || t.kind === kind) &&
      inDates(t.at, from, to),
  );
  const vol = rows.filter((t) => t.status === 'Successful').reduce((a, t) => a + t.amount, 0);
  return (
    <>
      <Filters q={q} setQ={setQ} placeholder="Search by transaction, merchant, customer or invoice">
        <Sel
          v={status}
          set={setStatus}
          all="All statuses"
          opts={['Successful', 'Failed', 'Pending', 'Refunded']}
        />
        <Sel v={prov} set={setProv} all="All providers" opts={['RMA', 'BoB']} />
        <Sel
          v={kind}
          set={setKind}
          all="Invoices and subscriptions"
          opts={['invoice', 'subscription']}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          title="From date"
        />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
      </Filters>
      <p>
        <small>
          {rows.length} transactions · successful volume {money(vol)}
        </small>
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Merchant</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Provider</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.id}</td>
                <td>{fmtTime(t.at)}</td>
                <td>{t.merchant}</td>
                <td>{t.customer || '—'}</td>
                <td>{money(t.amount)}</td>
                <td>{t.prov}</td>
                <td>{t.kind}</td>
                <td>
                  <Badge s={t.status} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8}>No transactions match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Audit() {
  const [q, setQ] = useState('');
  const { data = [] } = useApi<any[]>(
    'admin/audit' + (q ? '?q=' + encodeURIComponent(q) : ''),
    10000,
  );
  return (
    <>
      <Filters
        q={q}
        setQ={setQ}
        placeholder="Search by action (for example document.downloaded), user email or record"
      />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Record</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <td>{fmtTime(a.at)}</td>
                <td>
                  {a.user}
                  <br />
                  <small>{a.email}</small>
                </td>
                <td>{a.action}</td>
                <td>
                  {a.entity} {a.entityId}
                </td>
                <td>
                  <small>{a.ip}</small>
                </td>
              </tr>
            ))}
            {!data.length && (
              <tr>
                <td colSpan={5}>No entries.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Outbox() {
  const { data = [] } = useApi<any[]>('admin/outbox', 10000);
  const [open, setOpen] = useState('');
  return (
    <div className="card">
      <p>
        <small>
          Every email the platform sends. Without SMTP settings (see README) they are kept here as
          “Logged” instead of being delivered.
        </small>
      </p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>To</th>
            <th>Subject</th>
            <th>Kind</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map((e) => [
            <tr key={e.id} className="clk" onClick={() => setOpen(open === e.id ? '' : e.id)}>
              <td>{fmtTime(e.created_at)}</td>
              <td>{e.to_email}</td>
              <td>{e.subject}</td>
              <td>{e.kind}</td>
              <td>
                <Badge s={e.status === 'Logged' ? 'Queued' : e.status} /> <small>{e.status}</small>
              </td>
            </tr>,
            open === e.id && (
              <tr key={e.id + 'b'}>
                <td colSpan={5}>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>
                    {e.body}
                  </pre>
                  {e.error && <div className="err">{e.error}</div>}
                </td>
              </tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}
