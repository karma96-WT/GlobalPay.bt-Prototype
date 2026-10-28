'use client';
import { Shell, Stat, Profile, MenuItem } from '@/components/ui';
import Notes from '@/components/Notes';
import TicketDesk from '@/components/TicketDesk';
import Inbox from '@/components/operator/Inbox';
import Responses from '@/components/operator/Responses';
import { useApi } from '@/lib/api';

const MENU: MenuItem[] = [
  ['dashboard', 'Dashboard', null],
  ['inbox', 'Application Inbox', ['application.review']],
  ['responses', 'Provider Responses', ['response.record']],
  ['support', 'Support', ['support.reply']],
  ['notifications', 'Notifications', null],
  ['profile', 'Profile', null],
];

function Dashboard() {
  const { data: apps = [] } = useApi<any[]>('apps', 6000);
  const { data: tickets = [] } = useApi<any[]>('tickets', 6000);
  const n = (s: string) => apps.filter((a) => a.status === s).length;
  return (
    <div className="grid">
      {['Pending', 'Waiting', 'Correction required', 'Approved', 'Rejected'].map((s) => (
        <Stat key={s} n={n(s)} l={s} />
      ))}
      <Stat n={tickets.filter((t) => t.status !== 'Resolved').length} l="Open support requests" />
    </div>
  );
}

export default function OperatorPage() {
  return (
    <Shell portal="operator" menu={MENU}>
      {({ tab }) => (
        <>
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'inbox' && <Inbox />}
          {tab === 'responses' && <Responses />}
          {tab === 'support' && <TicketDesk kind="support" />}
          {tab === 'notifications' && <Notes />}
          {tab === 'profile' && <Profile />}
        </>
      )}
    </Shell>
  );
}
