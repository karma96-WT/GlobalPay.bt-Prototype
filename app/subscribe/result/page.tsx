'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Header, Footer } from '@/components/ui';
import { api, refreshAll, useMe } from '@/lib/api';
import { RC } from '@/lib/bfs';

/** Where BFS Secure returns a merchant after a subscription payment. */
export default function SubscribeResult() {
  const { data: me } = useMe();
  const [res, setRes] = useState<any>(undefined);
  const [ac, setAc] = useState<any>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const s = JSON.parse(localStorage.getItem('gp_bfs') || 'null');
    if (!s?.ac) return setRes(null);
    setAc(s.ac);
    api('public/pay/complete', 'POST', { ac: s.ac })
      .then((r) => {
        setRes(r);
        refreshAll();
      })
      .catch((e) => setRes({ error: e.message }));
  }, []);
  const good = res?.status === 'Successful';
  return (
    <>
      <Header me={me} home={me?.home} base="/merchant" bell={me?.unread} />
      <div className="main" style={{ margin: '0 auto', maxWidth: 640 }}>
        {res === undefined ? (
          <p>Verifying payment…</p>
        ) : !res || res.error ? (
          <div className="card">
            <h3>No payment result</h3>
            <p>{res?.error}</p>
            <Link className="btn" href="/merchant/settings">
              Back to settings
            </Link>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center' }}>
            <h2 style={{ color: good ? 'var(--ok)' : 'var(--bad)' }}>
              {good ? 'Subscription payment received' : 'Payment not completed'}
            </h2>
            <p>
              {res.code}: {RC[res.code] || 'Unknown'}
            </p>
            <p>
              <small>BFS Secure transaction ID {ac.bfs_bfsTxnId}</small>
            </p>
            {good && (
              <p>
                <a className="btn alt" href={`/api/receipts/${res.txnId}`}>
                  Download receipt (PDF)
                </a>
              </p>
            )}
            <Link className="btn" href="/merchant/settings">
              Back to Plan and billing
            </Link>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
