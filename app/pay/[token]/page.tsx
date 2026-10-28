'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Footer, PayHead, InvoiceView } from '@/components/ui';
import { api, useApi } from '@/lib/api';

/** What the customer sees when they open the payment link from the invoice email or QR code. */
export default function PayPage() {
  const { token } = useParams() as { token: string };
  const router = useRouter();
  const { data: iv, error } = useApi<any>(`public/invoice/${token}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pay = async () => {
    setBusy(true);
    setErr('');
    try {
      const { ar } = await api('public/pay/start', 'POST', { token });
      localStorage.setItem(
        'gp_bfs',
        JSON.stringify({
          ar,
          returnTo: `/pay/${token}/result`,
          abortTo: `/pay/${token}`,
          stage: 'entry',
          deadline: Date.now() + 300000,
          scn: '00',
          label: `Invoice ${iv.no}`,
          trace: ['1. AR message sent to BFS Secure over SSL (HTML form POST, redirect)'],
        }),
      );
      router.push('/bfs');
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <PayHead />
      <div className="main" style={{ margin: '0 auto', maxWidth: 720 }}>
        {error ? (
          <div className="card">
            <h3>Invoice not found</h3>
            <p>This payment link is not valid. Please ask the merchant for a new one.</p>
          </div>
        ) : !iv ? (
          <p>Loading…</p>
        ) : (
          <>
            <h2>Pay {iv.merchant.name}</h2>
            <InvoiceView iv={iv} />
            {iv.status === 'Unpaid' && (
              <div className="card">
                <p>
                  You will be taken to <b>BFS Secure</b> (RMA) to choose your bank and confirm with
                  an OTP. GlobalPay.bt never sees your bank account details or OTP.
                </p>
                {err && <div className="err">{err}</div>}
                <button disabled={busy} onClick={pay}>
                  {busy ? 'Redirecting…' : 'Pay with your bank account (BFS Secure)'}
                </button>
              </div>
            )}
            {iv.status === 'Paid' && (
              <div className="note">This invoice has been paid. Thank you.</div>
            )}
            {iv.status === 'Cancelled' && (
              <div className="note warn">
                This invoice was cancelled by the merchant. Please contact them for a new one.
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </>
  );
}
