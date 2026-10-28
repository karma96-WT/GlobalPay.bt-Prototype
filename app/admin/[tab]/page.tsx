'use client';
import { Shell, Stat, Profile, MenuItem } from '@/components/ui';
import Notes from '@/components/Notes';
import TicketDesk from '@/components/TicketDesk';
import Employees from '@/components/admin/Employees';
import Subscriptions from '@/components/admin/Subscriptions';
import Settings from '@/components/admin/Settings';
import {
  Merchants,
  Applications,
  Documents,
  Transactions,
  Audit,
  Outbox,
} from '@/components/admin/Lists';
import { useApi, money } from '@/lib/api';
import { PROVIDER_DOCS } from '@/lib/providers';

const MENU: MenuItem[] = [
  ['dashboard', 'Dashboard', null],
  ['employees', 'Employees', ['employee.manage']],
  ['merchants', 'Merchants', ['merchant.view']],
  ['applications', 'Applications', ['application.view']],
  ['providers', 'Providers', ['merchant.view']],
  ['documents', 'Document Monitoring', ['document.view']],
  ['transactions', 'Transactions', ['transaction.view']],
  ['subscriptions', 'Subscriptions', ['subscription.manage']],
  ['feedback', 'Feedback', ['feedback.handle']],
  ['audit', 'Audit Logs', ['audit.view']],
  ['outbox', 'Email Outbox', ['audit.view']],
  ['settings', 'Platform Settings', ['settings.manage']],
  ['notifications', 'Notifications', null],
  ['profile', 'Profile', null],
];

function Dashboard() {
  const { data: o } = useApi<any>('admin/overview', 8000);
  if (!o) return null;
  return (
    <div className="grid">
      <Stat n={o.merchants} l="Merchants" />
      <Stat n={o.open_apps} l="Open applications" />
      <Stat n={money(o.volume)} l="Sales volume this month" />
      <Stat n={o.paid} l="Successful payments" />
      <Stat n={o.expiring} l="Subscriptions ending in 3 days" />
      <Stat n={o.open_feedback} l="Open feedback" />
      <Stat n={o.open_support} l="Open support requests" />
      <Stat n={o.staff} l="Active staff" />
    </div>
  );
}
const Providers = () => (
  <div className="card">
    <table>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Services</th>
          <th>Documents required</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(PROVIDER_DOCS).map(([code, p]) => (
          <tr key={code}>
            <td>
              <b>{p.name}</b>
              <br />
              <small>{code}</small>
            </td>
            <td>
              {code === 'RMA'
                ? 'Nu. payments from local bank accounts (BFS Secure)'
                : 'Visa and Mastercard, INR and USD, MDR 3.5%'}
            </td>
            <td>
              <small>{p.docs.join(' · ')}</small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function AdminPage() {
  return (
    <Shell portal="admin" menu={MENU}>
      {({ me, tab }) => (
        <>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'employees' && <Employees me={me} />}
          {tab === 'merchants' && <Merchants />}
          {tab === 'applications' && <Applications />}
          {tab === 'providers' && <Providers />}
          {tab === 'documents' && <Documents />}
          {tab === 'transactions' && <Transactions />}
          {tab === 'subscriptions' && <Subscriptions />}
          {tab === 'feedback' && <TicketDesk kind="feedback" />}
          {tab === 'audit' && <Audit />}
          {tab === 'outbox' && <Outbox />}
          {tab === 'settings' && <Settings />}
          {tab === 'notifications' && <Notes />}
          {tab === 'profile' && <Profile />}
        </>
      )}
    </Shell>
  );
}
