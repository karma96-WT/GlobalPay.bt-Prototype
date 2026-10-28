'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Footer, PayHead, InvoiceView } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { RC } from '@/lib/bfs';

/** BFS Secure sends the customer back here with the AC message. We verify it on the server and show the receipt. */
export default function Result() {
  const { token } = useParams() as { token: string };
  const [res, setRes] = useState<any>(undefined);
  const [ac, setAc] = useState<any>(null);
  const started = useRef(false);
  const { data: iv } = useApi<any>(res ? `public/invoice/${token}` : null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const s = JSON.parse(localStorage.getItem('gp_bfs') || 'null');
    if (!s?.ac) return setRes(null);
    setAc(s.ac);
    api('public/pay/complete', 'POST', { ac: s.ac })
      .then(setRes)
      .catch((e) => setRes({ error: e.message }));
  }, []);

  const good = res?.status === 'Successful';
  return (
    <>
      <PayHead />
      <div className="main" style={{ margin: '0 auto', maxWidth: 720 }}>
        {res === undefined ? (
          <p>Verifying payment…</p>
        ) : res === null || res.error ? (
          <div className="card">
            <h3>No payment result</h3>
            <p>{res?.error || 'We did not receive a payment result.'}</p>
            <Link className="btn" href={`/pay/${token}`}>
              Back to invoice
            </Link>
          </div>
        ) : (
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <h2 style={{ color: good ? 'var(--ok)' : 'var(--bad)' }}>
                {good ? 'Payment successful' : 'Payment not completed'}
              </h2>
              <p>
                {res.code}: {RC[res.code] || 'Unknown'}
              </p>
              <p>
                <small>
                  BFS Secure transaction ID {ac.bfs_bfsTxnId} · Order {ac.bfs_orderNo}
                  {ac.bfs_debitAuthNo && <> · Debit authorisation {ac.bfs_debitAuthNo}</>}
                </small>
              </p>
              {good ? (
                <>
                  <p>
                    Your payment was recorded. Keep your receipt: it is also saved in GlobalPay.bt.
                  </p>
                  <a className="btn" href={`/api/public/receipt/${res.txnId}?t=${token}`}>
                    Download receipt (PDF)
                  </a>
                </>
              ) : (
                <Link className="btn" href={`/pay/${token}`}>
                  Try again
                </Link>
              )}
            </div>
            <div className="card">
              <h3>What GlobalPay.bt verified on the AC message</h3>
              {(
                [
                  ['Message signature (checksum)', res.checks.sig],
                  ['Amount matches the AR we sent', res.checks.amt],
                  ['Beneficiary ID matches', res.checks.benf],
                ] as [string, boolean][]
              ).map(([t, v]) => (
                <div className="line" key={t}>
                  <span>{t}</span>
                  <span className={'badge ' + (v ? 'b-ok' : 'b-bad')}>
                    {v ? 'Passed' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
            {iv && <InvoiceView iv={iv} />}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
