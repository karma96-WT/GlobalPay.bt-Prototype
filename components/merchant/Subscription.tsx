'use client';
import { useRouter } from 'next/navigation';
import { Badge, Toast, useToast, useRun } from '@/components/ui';
import { api, useApi, money, fmtDate } from '@/lib/api';

const SEATS: Record<string, string> = {
  Basic: '2 team seats',
  Gold: '10 team seats',
  Premium: 'Unlimited team seats',
};
const FEE: Record<string, string> = { Basic: '1.0%', Gold: '0.5%', Premium: '0.25%' };

/** The plan fee is paid through BFS Secure, to GlobalPay.bt's own beneficiary, and handled by the admin team on their side. */
export default function Subscription() {
  const { data } = useApi<any>('subscription', 10000);
  const router = useRouter();
  const [msg, toast] = useToast();
  const run = useRun(toast);
  if (!data) return null;
  const pay = async (plan: string) => {
    const r = await run(
      () => api('subscription/start', 'POST', { plan }),
      plan === 'Basic' ? 'Plan changed to Basic' : 'Redirecting to BFS Secure',
    );
    if (r?.ar) {
      localStorage.setItem(
        'gp_bfs',
        JSON.stringify({
          ar: r.ar,
          returnTo: '/subscribe/result',
          abortTo: '/merchant/settings',
          stage: 'entry',
          deadline: Date.now() + 300000,
          scn: '00',
          label: `${plan} plan subscription`,
          trace: ['1. AR message sent to BFS Secure (subscription payment to GlobalPay.bt)'],
        }),
      );
      router.push('/bfs');
    }
  };
  const warn = data.plan !== 'Basic' && data.daysLeft <= 3;
  return (
    <>
      <h3>Your plan</h3>
      <div className="card" style={{ background: 'var(--soft)', border: 0 }}>
        <div className="line" style={{ border: 0, padding: 0 }}>
          <div>
            <b style={{ fontSize: 20 }}>{data.plan}</b> <Badge s={data.status} />
            <br />
            <small>
              {data.periodEnd
                ? `Active until ${fmtDate(data.periodEnd)} (${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'} left)`
                : 'Free plan, no expiry'}
            </small>
          </div>
          {data.plan !== 'Basic' && (
            <button onClick={() => pay(data.plan)}>Renew for one month</button>
          )}
        </div>
        {warn && (
          <div className="note warn" style={{ marginTop: 12 }}>
            Your plan ends soon. We also email a reminder 3 days before it ends.
          </div>
        )}
      </div>
      <div className="grid">
        {Object.entries<any>(data.plans).map(([name, p]) => (
          <div
            key={name}
            className="card hov"
            style={{ borderColor: data.plan === name ? 'var(--forest)' : '', borderWidth: 2 }}
          >
            <b>{name}</b>
            <h3>
              {p.fee_minor ? money(p.fee_minor) : 'Free'}
              <small>{p.fee_minor ? ' / month' : ''}</small>
            </h3>
            <small>
              {FEE[name]} per payment
              <br />
              {SEATS[name]}
            </small>
            <p>
              <button
                className={data.plan === name ? 'alt' : ''}
                disabled={data.plan === name}
                onClick={() => pay(name)}
              >
                {data.plan === name
                  ? 'Current plan'
                  : name === 'Basic'
                    ? 'Switch to Basic'
                    : `Pay ${money(p.fee_minor)} with BFS Secure`}
              </button>
            </p>
          </div>
        ))}
      </div>
      <small>
        Indicative figures. Fees are billed monthly and never deducted from customer payments.
        Subscription payments go to GlobalPay.bt's own beneficiary ID, not to your customers'
        payments.
      </small>
      <h3 style={{ marginTop: 20 }}>Payment history</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Plan</th>
            <th>Amount</th>
            <th>Method</th>
            <th>Covers until</th>
          </tr>
        </thead>
        <tbody>
          {data.payments.map((p: any) => (
            <tr key={p.id}>
              <td>{fmtDate(p.created_at)}</td>
              <td>{p.plan}</td>
              <td>{money(p.amount_minor)}</td>
              <td>{p.method}</td>
              <td>{fmtDate(p.period_end)}</td>
            </tr>
          ))}
          {!data.payments.length && (
            <tr>
              <td colSpan={5}>No payments yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <Toast m={msg} />
    </>
  );
}
