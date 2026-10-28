// Invoice maths shared by the browser and the server. Everything returned is in minor units
// (1 Nu. = 100 chhertum) so totals never carry floating-point error.
export type Item = {
  d: string;
  q: number;
  p: number;
  disc?: { kind: 'none' | 'pct' | 'amt'; v: number | string };
};
export type Charge = {
  kind: 'Tax' | 'Delivery' | 'Service' | 'Other';
  label?: string;
  mode: 'pct' | 'amt';
  v: number | string;
};

const minor = (n: number | string) => Math.round((+n || 0) * 100);

export function calc(items: Item[], charges: Charge[] = []) {
  let sub = 0;
  let disc = 0;
  const lines = items.map((i) => {
    const gross = Math.round((+i.q || 0) * minor(i.p));
    const kind = i.disc?.kind || 'none';
    const d =
      kind === 'pct'
        ? Math.round((gross * Math.min(100, +(i.disc?.v || 0))) / 100)
        : kind === 'amt'
          ? Math.min(gross, minor(i.disc?.v || 0))
          : 0;
    sub += gross;
    disc += d;
    return { gross, disc: d, net: gross - d };
  });
  const net = sub - disc;
  const chs = charges.map((c) => ({
    ...c,
    amount: c.mode === 'pct' ? Math.round((net * (+c.v || 0)) / 100) : minor(c.v),
  }));
  const extra = chs.reduce((a, c) => a + c.amount, 0);
  return { lines, sub, disc, net, charges: chs, extra, total: net + extra };
}

export const chargeName = (c: Charge) => (c.kind === 'Other' ? c.label || 'Other charge' : c.kind);
export const nu = (minorUnits: number) =>
  'Nu. ' +
  (minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
