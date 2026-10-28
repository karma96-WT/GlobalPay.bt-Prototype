// Permission codes and labels, shared by the screens and the server.
export const MERCHANT_PERMS: [string, string][] = [
  ['invoice.create', 'Create and send invoices'],
  ['invoice.view', 'View invoices'],
  ['payment.view', 'View transactions'],
  ['refund.issue', 'Issue refunds'],
  ['report.export', 'View and download reports'],
  ['provider.toggle', 'Turn payment providers on or off'],
  ['application.manage', 'Manage provider applications and documents'],
  ['developer.manage', 'Manage API keys and webhooks'],
  ['support.manage', 'Raise and follow support requests'],
  ['business.edit', 'Edit business profile'],
  ['team.manage', 'Add members and assign roles'],
  ['plan.manage', 'Change plan and billing'],
];
export const STAFF_PERMS: [string, string][] = [
  ['application.view', 'See applications (read only)'],
  ['application.review', 'Review documents and forward applications'],
  ['response.record', 'Record provider replies and beneficiary IDs'],
  ['support.reply', 'Answer merchant support requests'],
  ['merchant.view', 'See merchants'],
  ['document.view', 'View and download documents'],
  ['transaction.view', 'See all transactions'],
  ['employee.manage', 'Add and manage staff'],
  ['subscription.manage', 'Manage merchant subscriptions'],
  ['feedback.handle', 'Handle feedback'],
  ['audit.view', 'Read audit logs'],
  ['settings.manage', 'Change platform settings'],
];
export const PLAN_SEATS: Record<string, number> = { Basic: 2, Gold: 10, Premium: Infinity };
export const can = (perms: string[] | undefined, ...need: string[]) =>
  !!perms && need.some((p) => perms.includes(p));
