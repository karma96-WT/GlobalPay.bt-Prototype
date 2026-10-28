'use client';
import Link from 'next/link';
import { Shell, Stat, Profile, MenuItem } from '@/components/ui';
import Notes from '@/components/Notes';
import Applications from '@/components/merchant/Applications';
import Providers from '@/components/merchant/Providers';
import Receive from '@/components/merchant/Receive';
import Invoices from '@/components/merchant/Invoices';
import Transactions from '@/components/merchant/Transactions';
import Reports from '@/components/merchant/Reports';
import Documents from '@/components/merchant/Documents';
import Support from '@/components/merchant/Support';
import Settings from '@/components/merchant/Settings';
import { useApi, money } from '@/lib/api';

const MENU: MenuItem[] = [
  ['dashboard', 'Dashboard', null],
  ['applications', 'My Applications', ['application.manage']],
  ['providers', 'Payment Providers', ['provider.toggle', 'application.manage']],
  ['receive', 'Receive Payments', ['invoice.create']],
  ['invoices', 'Invoices', ['invoice.view']],
  ['transactions', 'Transactions', ['payment.view']],
  ['reports', 'Reports', ['report.export']],
  ['documents', 'Documents', ['application.manage']],
  ['notifications', 'Notifications', null],
  ['support', 'Support', ['support.manage']],
  ['settings', 'Settings', ['business.edit', 'team.manage', 'developer.manage', 'plan.manage']],
  ['profile', 'Profile', null],
];

function Dashboard({ me }: { me: any }) {
  const can = me.perms.includes('payment.view');
  const { data: txns = [] } = useApi<any[]>(can ? 'transactions' : null, 8000);
  const sales = txns.filter((t) => t.kind === 'invoice');
  const good = sales.filter((t) => t.status === 'Successful');
  const ym = new Date().toISOString().slice(0, 7);
  const month = good.filter((t) => t.at.startsWith(ym));
  const count = (s: string) => sales.filter((t) => t.status === s).length;
  const sub = me.subscription;
  return (
    <>
      {!me.live && (
        <div className="note warn">
          <b>Your account is not live yet.</b> You can receive payments after a provider approves
          your application.{' '}
          {me.perms.includes('application.manage') && (
            <Link href="/merchant/applications">
              <u>Track applications</u>
            </Link>
          )}
        </div>
      )}
      {sub && sub.plan !== 'Basic' && sub.daysLeft <= 3 && (
        <div className="note warn">
          Your {sub.plan} plan ends in {sub.daysLeft} day{sub.daysLeft === 1 ? '' : 's'}.{' '}
          {me.perms.includes('plan.manage') && (
            <Link href="/merchant/settings">
              <u>Renew now</u>
            </Link>
          )}
        </div>
      )}
      {can ? (
        <div className="grid">
          <Stat
            n={money(month.reduce((a, t) => a + t.amount, 0))}
            l={`Volume this month · ${month.length} successful payment${month.length === 1 ? '' : 's'}`}
          />
          <Stat n={sales.length} l="Total transactions (count)" />
          <Stat n={good.length} l="Successful" />
          <Stat n={count('Failed')} l="Failed" />
          <Stat n={`${count('Pending')} / ${count('Refunded')}`} l="Pending / Refunded" />
          <Stat n={sub?.plan || 'Basic'} l="Current plan" />
        </div>
      ) : (
        <div className="card">
          <h3>Welcome, {me.name.split(' ')[0]}</h3>
          <p>
            You are signed in as {me.roleName}. The menu on the left shows what your role can do.
          </p>
        </div>
      )}
      <div className="card" style={{ marginTop: 16 }}>
        <h3>Recent activity</h3>
        <p>Application updates, payments and billing messages appear under Notifications.</p>
      </div>
    </>
  );
}

export default function MerchantPage() {
  return (
    <Shell portal="merchant" menu={MENU}>
      {({ me, tab }) => (
        <>
          {tab === 'dashboard' && <Dashboard me={me} />}
          {tab === 'applications' && <Applications />}
          {tab === 'providers' && <Providers me={me} />}
          {tab === 'receive' && <Receive me={me} />}
          {tab === 'invoices' && <Invoices me={me} />}
          {tab === 'transactions' && <Transactions me={me} />}
          {tab === 'reports' && <Reports />}
          {tab === 'documents' && <Documents />}
          {tab === 'notifications' && <Notes />}
          {tab === 'support' && <Support />}
          {tab === 'settings' && <Settings me={me} />}
          {tab === 'profile' && <Profile />}
        </>
      )}
    </Shell>
  );
}
