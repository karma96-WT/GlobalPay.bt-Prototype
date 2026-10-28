'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BANKS, RC, nowBTT, src, bfsSign } from '@/lib/bfs';

const BLUE = '#0b3d91';
const enc = (f: any) =>
  Object.keys(f)
    .map((k) => k + '=' + encodeURIComponent(f[k]))
    .join('&');
const mm = (n: number) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');

/**
 * Simulation of RMA's BFS Secure pages: bank and account number, OTP, then a status page
 * that sends the AC message back to GlobalPay.bt. The real pages belong to RMA.
 */
export default function Bfs() {
  const router = useRouter();
  const [S, setS] = useState<any>(undefined);
  const [bank, setBank] = useState('');
  const [acc, setAcc] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState('');
  const [left, setLeft] = useState(0);
  const [sent, setSent] = useState(false);
  const [as, setAs] = useState<any>(null);

  useEffect(() => {
    setS(JSON.parse(localStorage.getItem('gp_bfs') || 'null'));
  }, []);
  const save = (n: any) => {
    localStorage.setItem('gp_bfs', JSON.stringify(n));
    setS(n);
  };

  const finish = async (code: string) => {
    const a = S.ar;
    const f: any = {
      bfs_msgType: 'AC',
      bfs_bfsTxnId: '6201' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
      bfs_bfsTxnTime: nowBTT(),
      bfs_benfTxnTime: a.bfs_benfTxnTime,
      bfs_orderNo: a.bfs_orderNo,
      bfs_benfId: a.bfs_benfId,
      bfs_txnCurrency: a.bfs_txnCurrency,
      bfs_txnAmount: a.bfs_txnAmount,
      bfs_remitterName: 'Test User',
      bfs_remitterBankId: (bank || 'NA').slice(0, 10),
      bfs_debitAuthCode: code,
    };
    if (code === '00')
      f.bfs_debitAuthNo = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    f.bfs_checkSum = await bfsSign(f);
    save({
      ...S,
      stage: 'status',
      ac: f,
      code,
      trace: [...S.trace, `AC message created by BFS Secure, response code ${code} (${RC[code]})`],
    });
  };

  useEffect(() => {
    if (!S || S.stage === 'status') return;
    const t = setInterval(() => {
      const l = Math.max(0, Math.round((S.deadline - Date.now()) / 1000));
      setLeft(l);
      if (!l) {
        clearInterval(t);
        finish('TO');
      }
    }, 1000);
    return () => clearInterval(t);
  }, [S]);

  if (S === undefined) return <p style={{ padding: 30 }}>Loading…</p>;
  if (!S)
    return (
      <div style={{ padding: 30 }}>
        <h3>No payment session</h3>
        <p>Start from a payment link.</p>
      </div>
    );

  const len = BANKS.find((b) => b[0] === bank)?.[1];
  const accOk = !!len && acc.length === len;
  const a = S.ar;
  const submitAcc = () => {
    setBusy('Verifying account with the remitter bank…');
    setTimeout(() => {
      setBusy('');
      if (S.scn === '14') finish('14');
      else
        save({
          ...S,
          stage: 'otp',
          deadline: Date.now() + 360000,
          trace: [
            ...S.trace,
            `2. Remitter selected bank ${bank} and keyed in the account number`,
            '3. Account Inquiry Request sent to the remitter bank',
            '4. Remitter bank sent an OTP to the registered mobile',
          ],
        });
    }, 1500);
  };
  const submitOtp = () => {
    setSent(true);
    setBusy('Processing debit…');
    setTimeout(() => {
      setBusy('');
      finish(S.scn);
    }, 1500);
  };
  const askAS = async () => {
    const f: any = { ...a, bfs_msgType: 'AS' };
    delete f.bfs_checkSum;
    f.bfs_checkSum = await bfsSign(f);
    setAs(f);
  };

  return (
    <div style={{ background: '#eef3fb', minHeight: '100vh' }}>
      <div
        style={{
          background: BLUE,
          color: '#fff',
          padding: '14px 28px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <b style={{ fontSize: 20, letterSpacing: 1 }}>BFS SECURE</b>
        <small style={{ color: '#cfe0ff' }}>Prototype simulation of the RMA BFS Secure page</small>
      </div>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: 24,
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
        }}
      >
        <div>
          <div className="card">
            <h3 style={{ color: BLUE }}>Transaction information</h3>
            <table>
              <tbody>
                {[
                  ['Beneficiary ID', a.bfs_benfId],
                  ['Order number', a.bfs_orderNo],
                  ['Description', a.bfs_paymentDesc],
                  ['Amount', a.bfs_txnCurrency + ' ' + a.bfs_txnAmount],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <small>{k}</small>
                    </td>
                    <td>
                      <b>{v}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {S.stage === 'entry' && (
            <div className="card">
              <h3 style={{ color: BLUE }}>Select your bank</h3>
              <small>Session expires in {mm(left || 300)} if idle</small>
              <label>Remitter bank</label>
              <select
                value={bank}
                onChange={(e) => {
                  setBank(e.target.value);
                  setAcc('');
                }}
              >
                <option value="">Select bank</option>
                {BANKS.map((b) => (
                  <option key={b[0]}>{b[0]}</option>
                ))}
              </select>
              <label>Account number{len ? ` (${len} digits)` : ''}</label>
              <input
                disabled={!bank || !!busy}
                value={acc}
                maxLength={len || 12}
                onChange={(e) => setAcc(e.target.value.replace(/\D/g, ''))}
              />
              {bank && acc.length > 0 && !accOk && (
                <small style={{ color: 'var(--bad)' }}>
                  {bank} account numbers have {len} digits.
                </small>
              )}
              <p style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ background: BLUE, color: '#fff' }}
                  disabled={!accOk || !!busy}
                  onClick={submitAcc}
                >
                  {busy || 'Submit'}
                </button>
                <button className="alt" disabled={!!busy} onClick={() => finish('UC')}>
                  Cancel
                </button>
              </p>
            </div>
          )}
          {S.stage === 'otp' && (
            <div className="card">
              <h3 style={{ color: BLUE }}>Enter OTP</h3>
              <small>
                An OTP was sent by {bank} to your registered mobile. Session expires in{' '}
                {mm(left || 360)}.
              </small>
              <label>6-digit OTP</label>
              <input
                disabled={sent}
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              />
              {otp.length < 6 && <small>Please enter a 6-digit OTP</small>}
              <p>
                <button
                  style={{ background: BLUE, color: '#fff' }}
                  disabled={otp.length !== 6 || sent}
                  onClick={submitOtp}
                >
                  {busy || 'Submit'}
                </button>
              </p>
            </div>
          )}
          {S.stage === 'status' && (
            <div className="card" style={{ textAlign: 'center' }}>
              <h3 style={{ color: S.code === '00' ? 'var(--ok)' : 'var(--bad)' }}>
                {S.code === '00'
                  ? 'Transaction approved'
                  : S.code === '14'
                    ? 'Account verification failed'
                    : 'Transaction not completed'}
              </h3>
              <p>
                Response code {S.code}: {RC[S.code]}
              </p>
              {S.code === '14' && (
                <small>
                  Another attempt is not allowed from this page. You will return to the merchant
                  checkout to start again.
                </small>
              )}
              <p>
                <button
                  style={{ background: BLUE, color: '#fff' }}
                  onClick={() => router.push(S.returnTo)}
                >
                  {S.code === '14'
                    ? 'Return to checkout'
                    : 'Click Here to Complete Your Transaction'}
                </button>
              </p>
            </div>
          )}
        </div>
        <div>
          <div className="card">
            <h3>Demo controls</h3>
            <label>Outcome to simulate</label>
            <select
              value={S.scn}
              disabled={S.stage === 'status'}
              onChange={(e) => save({ ...S, scn: e.target.value })}
            >
              {[
                ['00', 'Approved'],
                ['51', 'Insufficient funds'],
                ['14', 'Account verification fails'],
                ['48', 'Transaction limit exceeded'],
                ['61', 'Withdrawal limit exceeded'],
                ['85', 'Internal error at bank'],
              ].map(([c, t]) => (
                <option key={c} value={c}>
                  {c} · {t}
                </option>
              ))}
            </select>
            <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="alt" disabled={S.stage === 'status'} onClick={() => finish('TO')}>
                Simulate idle timeout (TO)
              </button>
              <button
                className="alt"
                onClick={() => {
                  localStorage.removeItem('gp_bfs');
                  router.push(S.abortTo);
                }}
              >
                Abort
              </button>
            </p>
          </div>
          <div className="card">
            <h3>Messages</h3>
            <b>AR (request from GlobalPay.bt)</b>
            <pre className="m">{enc(a).replace(/&/g, '\n')}</pre>
            <small>Checksum source string (values sorted by field name, joined by |):</small>
            <pre className="m">{src(a)}</pre>
            {S.ac && (
              <>
                <b>AC (response to GlobalPay.bt)</b>
                <pre className="m">{enc(S.ac).replace(/&/g, '\n')}</pre>
              </>
            )}
            <b>AS (status query)</b>
            <p>
              <small>
                Sent only if no AC arrives. Polling starts 6 minutes after the debit request, stops
                on a final result, and is never used for authorisation or account enquiry.
              </small>
            </p>
            <button className="alt" disabled={S.stage !== 'status'} onClick={askAS}>
              Simulate AS query
            </button>
            {as && (
              <>
                <pre className="m">{enc(as).replace(/&/g, '\n')}</pre>
                <small>Response (AC, URL-encoded string):</small>
                <pre className="m">{enc(S.ac)}</pre>
              </>
            )}
          </div>
          <div className="card">
            <h3>Flow trace</h3>
            {S.trace.map((t: string, i: number) => (
              <div key={i}>
                <small>{t}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
