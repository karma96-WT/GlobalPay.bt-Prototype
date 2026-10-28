'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { InvoiceView, PhoneInput, Toast, useToast, useRun, full, local } from '@/components/ui';
import { api, useApi, money } from '@/lib/api';
import { calc, chargeName } from '@/lib/calc';
import { EMAIL_RE, LOCAL_MOBILE_RE } from '@/lib/validation';

const CHARGE_KINDS = ['Tax', 'Delivery', 'Service', 'Other'];
const num = (s: string) => s.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
const newItem = () => ({ d: '', q: '1', p: '', dk: 'none', dv: '' });
const newCharge = () => ({ kind: 'Delivery', label: '', mode: 'amt', v: '' });

export default function Receive({ me }: { me: any }) {
  const { data: conns = [] } = useApi<any[]>('connections');
  const rma = conns.find((c) => c.prov === 'RMA');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [step, setStep] = useState<'form' | 'preview' | 'sent'>('form');
  const [cust, setCust] = useState({ name: '', email: '', mobile: '' });
  const [items, setItems] = useState([newItem()]);
  const [charges, setCharges] = useState<ReturnType<typeof newCharge>[]>([]);
  const [notes, setNotes] = useState('');
  const [inv, setInv] = useState<any>(null);
  const [to, setTo] = useState('');
  const [qr, setQr] = useState('');

  const payload = () => ({
    customer: { name: cust.name, email: cust.email, mobile: full(cust.mobile) },
    items: items.map((i) => ({
      d: i.d,
      q: Number(i.q),
      p: Number(i.p),
      disc: { kind: i.dk, v: Number(i.dv || 0) },
    })),
    charges: charges.map((c) => ({
      kind: c.kind,
      label: c.label,
      mode: c.mode,
      v: Number(c.v || 0),
    })),
    notes,
  });
  const p = payload();
  const totals = calc(p.items as any, p.charges as any);
  const problems: string[] = [];
  if (!items.every((i) => i.d.trim() && Number(i.q) > 0 && Number(i.p) > 0))
    problems.push('Every item needs a description, a quantity and a price');
  if (charges.some((c) => c.kind === 'Other' && !c.label.trim()))
    problems.push('Say what the "Other" charge is for');
  if (cust.email && !EMAIL_RE.test(cust.email)) problems.push('Customer email is not valid');
  if (cust.mobile && !LOCAL_MOBILE_RE.test(cust.mobile))
    problems.push('Customer mobile is not valid');
  const link =
    inv && typeof window !== 'undefined' ? `${window.location.origin}/pay/${inv.token}` : '';
  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 180 }).then(setQr);
  }, [link]);

  const setItem = (i: number, patch: any) =>
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setCharge = (i: number, patch: any) =>
    setCharges(charges.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const reset = () => {
    setCust({ name: '', email: '', mobile: '' });
    setItems([newItem()]);
    setCharges([]);
    setNotes('');
    setInv(null);
    setStep('form');
  };

  if (!rma?.on)
    return (
      <div className="note warn">
        You can create invoices once RMA approves your application and the provider is switched on
        (Payment Providers).
      </div>
    );

  return (
    <>
      {step === 'form' && (
        <>
          <div className="note">
            Currency selects the provider: Nu. goes through RMA (BFS Secure). INR and USD (Bank of
            Bhutan) will be added when BoB's integration documents are received.
          </div>
          <div className="card">
            <h3>Invoice</h3>
            <div className="row">
              <div>
                <label>Invoice number</label>
                <input value={inv?.no || 'Assigned when you review'} readOnly />
              </div>
              <div>
                <label>Invoice date</label>
                <input value={inv?.date || new Date().toISOString().slice(0, 10)} readOnly />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Currency *</label>
                <select>
                  <option>Nu. (RMA)</option>
                  <option disabled>INR (BoB, coming soon)</option>
                  <option disabled>USD (BoB, coming soon)</option>
                </select>
              </div>
              <div>
                <label>Payment provider</label>
                <input value="RMA (BFS Secure)" readOnly />
              </div>
            </div>
          </div>

          <div className="row">
            <div className="bill">
              <h3>Bill from</h3>
              <small>From your business profile (Settings, Business).</small>
              <label>Registered business name</label>
              <input value={me.biz.name} readOnly />
              <label>Address</label>
              <input value={me.biz.addr || '—'} readOnly />
              <label>Phone and email</label>
              <input value={`${me.biz.phone} · ${me.biz.email}`} readOnly />
            </div>
            <div className="bill">
              <h3>Bill to</h3>
              <small>Your customer. An email is needed to send the invoice.</small>
              <label>Customer name</label>
              <input
                value={cust.name}
                placeholder="Pema Choden"
                onChange={(e) => setCust({ ...cust, name: e.target.value })}
              />
              <label>Email</label>
              <input
                value={cust.email}
                placeholder="pema.choden@example.com"
                onChange={(e) => setCust({ ...cust, email: e.target.value })}
              />
              <PhoneInput
                label="Mobile (optional)"
                value={cust.mobile}
                onChange={(v) => setCust({ ...cust, mobile: v })}
              />
            </div>
          </div>

          <div className="card">
            <h3>Products and services</h3>
            <table>
              <thead>
                <tr>
                  <th>Description *</th>
                  <th style={{ width: 80 }}>Qty *</th>
                  <th style={{ width: 120 }}>Unit price (Nu.) *</th>
                  <th style={{ width: 230 }}>Discount on this item</th>
                  <th style={{ width: 110 }}>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={it.d}
                        placeholder="Day tour, Paro Taktsang"
                        onChange={(e) => setItem(i, { d: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={it.q}
                        onChange={(e) => setItem(i, { q: num(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        inputMode="decimal"
                        value={it.p}
                        placeholder="0.00"
                        onChange={(e) => setItem(i, { p: num(e.target.value) })}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <select
                          value={it.dk}
                          onChange={(e) => setItem(i, { dk: e.target.value, dv: '' })}
                        >
                          <option value="none">No discount</option>
                          <option value="pct">Percent (%)</option>
                          <option value="amt">Amount (Nu.)</option>
                        </select>
                        {it.dk !== 'none' && (
                          <input
                            inputMode="decimal"
                            style={{ width: 90 }}
                            value={it.dv}
                            placeholder={it.dk === 'pct' ? '10' : '500'}
                            onChange={(e) => setItem(i, { dv: num(e.target.value) })}
                          />
                        )}
                      </div>
                    </td>
                    <td>{money(totals.lines[i]?.net)}</td>
                    <td>
                      {items.length > 1 && (
                        <button
                          className="alt"
                          onClick={() => setItems(items.filter((_, j) => j !== i))}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              <button className="alt" onClick={() => setItems([...items, newItem()])}>
                + Add item
              </button>
            </p>
          </div>

          <div className="card">
            <h3>Additional charges</h3>
            <small>
              Tax, delivery, service or anything else. They are added to the total after item
              discounts.
            </small>
            {charges.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <select
                  style={{ width: 140 }}
                  value={c.kind}
                  onChange={(e) => setCharge(i, { kind: e.target.value })}
                >
                  {CHARGE_KINDS.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                {c.kind === 'Other' && (
                  <input
                    style={{ flex: 1, minWidth: 180 }}
                    placeholder="Specify, e.g. Packaging"
                    value={c.label}
                    onChange={(e) => setCharge(i, { label: e.target.value })}
                  />
                )}
                <select
                  style={{ width: 130 }}
                  value={c.mode}
                  onChange={(e) => setCharge(i, { mode: e.target.value })}
                >
                  <option value="pct">Percent (%)</option>
                  <option value="amt">Amount (Nu.)</option>
                </select>
                <input
                  inputMode="decimal"
                  style={{ width: 110 }}
                  placeholder={c.mode === 'pct' ? '5' : '100'}
                  value={c.v}
                  onChange={(e) => setCharge(i, { v: num(e.target.value) })}
                />
                <button
                  className="alt"
                  onClick={() => setCharges(charges.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <p>
              <button className="alt" onClick={() => setCharges([...charges, newCharge()])}>
                + Add charge
              </button>
            </p>
            <label>Notes and terms (optional)</label>
            <textarea
              rows={2}
              value={notes}
              placeholder="Payment instructions or terms"
              onChange={(e) => setNotes(e.target.value)}
            />
            <hr />
            <div style={{ textAlign: 'right' }}>
              Items {money(totals.sub)}
              <br />
              {totals.disc > 0 && (
                <>
                  Item discounts −{money(totals.disc)}
                  <br />
                </>
              )}
              {totals.charges.map((c, i) => (
                <span key={i}>
                  {chargeName(c)} {money(c.amount)}
                  <br />
                </span>
              ))}
              <b style={{ fontSize: 22 }}>Grand total {money(totals.total)}</b>
            </div>
          </div>
          {problems.map((x) => (
            <div className="err" key={x}>
              {x}
            </div>
          ))}
          <p>
            <button
              disabled={!!problems.length || totals.total <= 0}
              onClick={async () => {
                const r = await run(
                  () =>
                    inv
                      ? api(`invoices/${inv.id}`, 'PUT', payload())
                      : api('invoices', 'POST', payload()),
                  'Invoice ready to review',
                );
                if (r && r !== true) {
                  setInv(r);
                  setTo(r.cust.email);
                  setStep('preview');
                }
              }}
            >
              Review invoice
            </button>
          </p>
        </>
      )}

      {step === 'preview' && inv && (
        <>
          <div className="card">
            <h3>Preview before sending</h3>
            <small>This is what your customer receives by email.</small>
            <div className="note" style={{ marginTop: 12 }}>
              <small>
                Subject: Invoice {inv.no} from {inv.merchant.name}
              </small>
            </div>
            <p>
              Hello{inv.cust.name ? ' ' + inv.cust.name : ''}, {inv.merchant.name} has sent you an
              invoice for <b>{money(inv.total)}</b>. Pay securely with your bank account using the
              link or QR code.
            </p>
            <InvoiceView iv={inv} />
            <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {qr && <img src={qr} alt="QR code for the payment link" width={150} height={150} />}
              <div>
                <span className="btn">Pay now</span>
                <br />
                <small>{link}</small>
              </div>
            </div>
          </div>
          <div className="card">
            <label>Send invoice to</label>
            <input
              value={to}
              placeholder="customer@example.com"
              onChange={(e) => setTo(e.target.value)}
            />
            <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="alt" onClick={() => setStep('form')}>
                ← Something is wrong: edit invoice
              </button>
              <button
                disabled={!EMAIL_RE.test(to)}
                onClick={async () => {
                  if (
                    await run(
                      () => api(`invoices/${inv.id}/action`, 'POST', { action: 'send', to }),
                      'Invoice emailed to ' + to,
                    )
                  )
                    setStep('sent');
                }}
              >
                Send invoice
              </button>
            </p>
          </div>
        </>
      )}

      {step === 'sent' && inv && (
        <div className="card">
          <h3>Invoice sent</h3>
          <p>
            {inv.no} was emailed to <b>{to}</b> with the payment link and QR code. Status: Unpaid.
            You can follow it under Invoices.
          </p>
          <p style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn" href={link} target="_blank">
              Open customer payment page
            </a>
            <button className="alt" onClick={reset}>
              Create another
            </button>
          </p>
        </div>
      )}
      <Toast m={msg} />
    </>
  );
}
