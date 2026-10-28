// RMA BFS Secure message helpers: AR (request), AC (response), AS (status query).
// Used by the browser (the simulated BFS Secure pages) and the server (building AR, checking AC).

// Bank codes and account-number lengths: RMA PG integration notes
export const BANKS: [string, number][] = [
  ['BDBL', 12],
  ['BNBL', 9],
  ['BOBL', 9],
  ['DPNBL', 12],
  ['TBank', 9],
  ['DK', 12],
];

// Response codes: BFS Secure technical document, Table 6
export const RC: Record<string, string> = {
  '00': 'Approved',
  '03': 'Invalid Beneficiary',
  '05': 'Beneficiary Account Closed',
  '12': 'Invalid Transaction',
  '13': 'Invalid Amount',
  '14': 'Invalid Remitter Account',
  '20': 'Invalid Response',
  '30': 'Transaction Not Supported Or Format Error',
  '45': 'Duplicate Beneficiary Order Number',
  '47': 'Invalid Currency',
  '48': 'Transaction Limit Exceeded',
  '51': 'Insufficient Funds',
  '53': 'No Savings Account',
  '57': 'Transaction Not Permitted',
  '61': 'Withdrawal Limit Exceeded',
  '65': 'Withdrawal Frequency Exceeded',
  '76': 'Transaction Not Found',
  '78': 'Decryption Failed',
  '80': 'Buyer Cancel Transaction',
  '84': 'Invalid Transaction Type',
  '85': 'Internal Error At Bank System',
  UC: 'Transaction Cancelled By Customer',
  UN: 'UnKnown error',
  TO: 'Session Timeout at BFS Secure Entry Page',
  NF: 'Txn Not Found',
  IM: 'Invalid Message',
};

/** Time in Bhutan (UTC+6) as YYYYMMDDHHmmSS. */
export const nowBTT = () => {
  const d = new Date(Date.now() + 6 * 3600e3);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    '' +
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
};
/** Payment description: 30 characters, limited character set. */
export const sanitize = (s: string) => s.replace(/[^A-Za-z0-9@\/\\() .\-_,&']/g, '').slice(0, 30);
/** Values of every field except the checksum, sorted by field name and joined with |. */
export const src = (f: any) =>
  Object.keys(f)
    .filter((k) => k !== 'bfs_checkSum')
    .sort()
    .map((k) => f[k])
    .join('|');
// Prototype stand-in: SHA-256 (the specification allows SHA-2). Production signing follows the RMA / BFS key exchange.
export async function bfsSign(f: any) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src(f)));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
export async function buildAR(p: {
  benfId: string;
  bank: string;
  amountMinor: number;
  desc: string;
  email?: string;
}) {
  const f: any = {
    bfs_msgType: 'AR',
    bfs_benfTxnTime: nowBTT(),
    bfs_orderNo: ('GP' + Date.now() + Math.floor(Math.random() * 1000)).slice(0, 40),
    bfs_benfId: p.benfId,
    bfs_benfBankCode: p.bank,
    bfs_txnCurrency: 'BTN',
    bfs_txnAmount: (p.amountMinor / 100).toFixed(2),
    bfs_paymentDesc: sanitize(p.desc),
    bfs_version: '1.0',
  };
  if (p.email) f.bfs_remitterEmail = p.email.slice(0, 50);
  f.bfs_checkSum = await bfsSign(f);
  return f;
}
