import { query, tx } from '../db';
import { route, bad, HttpError, Ctx } from '../registry';
import { notify, audit } from '../util';

const MAX_FILE = 4 * 1024 * 1024;
const EDITABLE = ['Pending', 'Correction required'];
const has = (c: Ctx, p: string) => c.user.perms.includes(p);

/** Applications with their documents, in the shape the screens use. */
export async function loadApps(where: string, params: any[]) {
  const rows = await query(
    `SELECT a.*, m.legal_name, m.id AS biz_id, m.business_type, m.email AS biz_email, m.phone AS biz_phone, m.rep_name
       FROM applications a JOIN merchants m ON m.id = a.merchant_id ${where} ORDER BY a.created_at DESC, a.id DESC`,
    params,
  );
  const docs = rows.length
    ? await query(
        'SELECT * FROM application_documents WHERE application_id = ANY($1) ORDER BY position',
        [rows.map((r) => r.id)],
      )
    : [];
  return rows.map((r) => ({
    id: r.id,
    who: r.legal_name,
    businessId: r.biz_id,
    bizType: r.business_type,
    prov: r.provider,
    date: r.submitted_on,
    status: r.status,
    op: r.operator_name || '—',
    route: r.route,
    mid: r.provided_merchant_id || undefined,
    note: r.operator_note || undefined,
    reason: r.rejection_reason || undefined,
    contact: { name: r.rep_name, email: r.biz_email, phone: r.biz_phone },
    docs: docs
      .filter((d) => d.application_id === r.id)
      .map((d) => ({
        n: d.doc_name,
        name: d.file_name,
        size: d.file_size,
        type: d.mime,
        state: d.state,
        note: d.note || undefined,
        demo: !d.file_name,
        at: d.uploaded_at,
      })),
  }));
}
const scopeWhere = (c: Ctx) =>
  (c.user.scope === 'merchant' ? ['WHERE a.merchant_id = $1', [c.user.merchantId]] : ['', []]) as [
    string,
    any[],
  ];

route(
  'GET',
  'apps',
  { perm: ['application.manage', 'application.review', 'application.view'] },
  async (c) => {
    if (c.user.scope === 'merchant' && !c.user.merchantId) return [];
    return loadApps(...scopeWhere(c));
  },
);

async function own(c: Ctx, id: string) {
  const [w, p] = scopeWhere(c);
  const [a] = await loadApps(`${w ? w + ' AND' : 'WHERE'} a.id = $${p.length + 1}`, [...p, id]);
  if (!a) throw new HttpError(404, 'Application not found');
  return a;
}

// ---- replace one document (merchant, only until the operator forwards the application)
route('POST', 'apps/:id/doc', { scope: 'merchant', perm: ['application.manage'] }, async (c) => {
  const a = await own(c, c.p.id);
  if (!EDITABLE.includes(a.status))
    throw new HttpError(409, 'This application has been forwarded, so documents are locked');
  const f = await c.form();
  const name = String(f.get('name') || '');
  const file = f.get('file') as File | null;
  if (!a.docs.some((d: any) => d.n === name)) throw bad('Unknown document');
  if (!file || typeof file === 'string' || !file.size) throw bad('Choose a file');
  if (!/(pdf|jpe?g|png)$/i.test(file.name)) throw bad('Only PDF, JPG or PNG files');
  if (file.size > MAX_FILE) throw bad('File is over 4 MB');
  await tx(async (q) => {
    await q(
      "UPDATE application_documents SET file_name = $3, file_size = $4, mime = $5, state = 'Uploaded', note = NULL, uploaded_at = now() WHERE application_id = $1 AND doc_name = $2",
      [a.id, name, file.name, file.size, file.type || 'application/octet-stream'],
    );
    await q(
      'INSERT INTO files (application_id, doc_name, data) VALUES ($1,$2,$3) ON CONFLICT (application_id, doc_name) DO UPDATE SET data = EXCLUDED.data',
      [a.id, name, Buffer.from(await file.arrayBuffer())],
    );
    await notify(
      'operator',
      'Document',
      `Document changed: ${name}`,
      `${a.who} replaced a document on ${a.id}.`,
      null,
      q,
    );
    await audit(c.user.id, 'document.replaced', 'application', a.id, { doc: name }, c.ip, q);
  });
  return { ok: true };
});

// ---- view or download one document
route(
  'GET',
  'files/:id/:doc',
  { perm: ['application.manage', 'application.review', 'document.view'] },
  async (c) => {
    await own(c, c.p.id);
    const [r] = await query(
      `SELECT d.file_name, d.mime, f.data FROM application_documents d JOIN files f USING (application_id, doc_name) WHERE d.application_id = $1 AND d.doc_name = $2`,
      [c.p.id, c.p.doc],
    );
    if (!r) throw new HttpError(404, 'No file stored for this document');
    const dl = c.url.searchParams.get('download') === '1';
    await audit(
      c.user.id,
      dl ? 'document.downloaded' : 'document.viewed',
      'application',
      c.p.id,
      { doc: c.p.doc },
      c.ip,
    );
    return new Response(r.data, {
      headers: {
        'content-type': r.mime,
        'content-disposition': `${dl ? 'attachment' : 'inline'}; filename="${encodeURIComponent(r.file_name)}"`,
      },
    });
  },
);

// ---- workflow actions
route(
  'POST',
  'apps/:id/action',
  { perm: ['application.manage', 'application.review', 'response.record'] },
  async (c) => {
    const b = await c.json();
    const a = await own(c, c.p.id);
    const op = c.user.name.split(' ')[0] + ' ' + (c.user.name.split(' ')[1]?.[0] || '') + '.';
    const tellMerchant = (q: any, t: string, body: string) =>
      notify('merchant', 'Application', t, body, a.businessId, q);
    const need = (p: string) => {
      if (!has(c, p)) throw new HttpError(403, 'Your role does not allow this');
    };

    switch (b.action) {
      case 'resubmit': {
        need('application.manage');
        if (c.user.scope !== 'merchant' || a.status !== 'Correction required')
          throw new HttpError(409, 'Nothing to resubmit');
        await tx(async (q) => {
          await q(
            "UPDATE applications SET status = 'Pending', operator_note = NULL WHERE id = $1",
            [a.id],
          );
          await notify(
            'operator',
            'Application',
            `Resubmitted: ${a.id}`,
            `${a.who} resubmitted the ${a.prov} application after corrections.`,
            null,
            q,
          );
          await tellMerchant(q, `You resubmitted ${a.id}`, 'An operator will review it again.');
          await audit(c.user.id, 'application.resubmitted', 'application', a.id, null, c.ip, q);
        });
        return { ok: true };
      }
      case 'accept-doc':
      case 'return-doc': {
        need('application.review');
        if (a.status !== 'Pending')
          throw new HttpError(
            409,
            'Documents can only be reviewed while the application is pending',
          );
        const d = a.docs.find((x: any) => x.n === b.doc);
        if (!d) throw bad('Unknown document');
        const ret = b.action === 'return-doc';
        if (ret && !String(b.reason || '').trim())
          throw bad('Say why the document is being returned');
        await tx(async (q) => {
          await q(
            'UPDATE application_documents SET state = $3, note = $4 WHERE application_id = $1 AND doc_name = $2',
            [a.id, d.n, ret ? 'Returned' : 'Verified', ret ? b.reason.trim() : null],
          );
          await q('UPDATE applications SET operator_name = $2 WHERE id = $1', [a.id, op]);
          await tellMerchant(
            q,
            ret ? `Document returned: ${d.n}` : `Document accepted: ${d.n}`,
            ret
              ? `${b.reason.trim()}. Please upload a corrected copy on ${a.id}.`
              : `An operator accepted "${d.n}" on ${a.id}.`,
          );
          await audit(
            c.user.id,
            ret ? 'document.returned' : 'document.accepted',
            'application',
            a.id,
            { doc: d.n },
            c.ip,
            q,
          );
        });
        return { ok: true };
      }
      case 'correction': {
        need('application.review');
        if (!['Pending', 'Rejected'].includes(a.status))
          throw new HttpError(409, 'A correction cannot be requested now');
        const text =
          String(b.note || '').trim() ||
          (a.status === 'Rejected'
            ? 'Please correct the issues the provider raised and resubmit.'
            : 'Some documents need to be corrected.');
        await tx(async (q) => {
          await q(
            "UPDATE applications SET status = 'Correction required', operator_note = $2, operator_name = $3 WHERE id = $1",
            [a.id, text, op],
          );
          await tellMerchant(
            q,
            a.status === 'Rejected' ? `Resubmission needed: ${a.id}` : `Correction needed: ${a.id}`,
            text,
          );
          await audit(
            c.user.id,
            'application.correction_requested',
            'application',
            a.id,
            { text },
            c.ip,
            q,
          );
        });
        return { ok: true };
      }
      case 'forward': {
        need('application.review');
        if (a.status !== 'Pending')
          throw new HttpError(409, 'Only pending applications can be forwarded');
        if (a.route === 'docs' && !a.docs.every((d: any) => d.state === 'Verified'))
          throw new HttpError(409, 'Accept every document before forwarding');
        await tx(async (q) => {
          await q(
            "UPDATE applications SET status = 'Waiting', operator_note = NULL, operator_name = $2 WHERE id = $1",
            [a.id, op],
          );
          await tellMerchant(
            q,
            `Forwarded to ${a.prov}`,
            `${a.id} was sent to ${a.prov}. We will tell you as soon as they reply.`,
          );
          await audit(
            c.user.id,
            'application.forwarded',
            'application',
            a.id,
            { to: a.prov },
            c.ip,
            q,
          );
        });
        return { ok: true };
      }
      case 'accept': {
        need('response.record');
        if (a.status !== 'Waiting')
          throw new HttpError(409, 'There is no provider reply to record for this application');
        const benf = String(b.benfId || '')
          .trim()
          .toUpperCase();
        if (!/^[A-Z0-9]{1,10}$/.test(benf))
          throw bad('The ID must be up to 10 letters or digits, for example BE00000585');
        const [clash] = await query(
          'SELECT m.legal_name FROM merchant_provider_accounts p JOIN merchants m ON m.id = p.merchant_id WHERE p.provider = $1 AND p.beneficiary_id = $2 AND p.merchant_id <> $3',
          [a.prov, benf, a.businessId],
        );
        if (clash) throw new HttpError(409, `That ID is already assigned to ${clash.legal_name}`);
        const label = a.prov === 'RMA' ? 'Beneficiary ID' : 'Merchant ID';
        await tx(async (q) => {
          await q(
            "UPDATE applications SET status = 'Approved', rejection_reason = NULL, operator_note = NULL WHERE id = $1",
            [a.id],
          );
          await q(
            `INSERT INTO merchant_provider_accounts (merchant_id, provider, beneficiary_id, bank_code, provider_ref, accepted_on)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (merchant_id, provider) DO UPDATE SET beneficiary_id = EXCLUDED.beneficiary_id, bank_code = EXCLUDED.bank_code, provider_ref = EXCLUDED.provider_ref, accepted_on = EXCLUDED.accepted_on, enabled = true`,
            [
              a.businessId,
              a.prov,
              benf,
              a.prov === 'RMA' ? b.bank || '01' : null,
              b.ref || null,
              b.date || null,
            ],
          );
          await q(
            "UPDATE users SET onboarding_stage = 'merchant' WHERE merchant_id = $1 AND onboarding_stage = 'applied'",
            [a.businessId],
          );
          await tellMerchant(
            q,
            `${a.prov} approved your application`,
            `${a.id} was approved. Your ${label} is ${benf}. Payments through ${a.prov} are now live.`,
          );
          await audit(
            c.user.id,
            'application.provider_accepted',
            'application',
            a.id,
            { benf },
            c.ip,
            q,
          );
        });
        return { ok: true };
      }
      case 'reject': {
        need('response.record');
        if (a.status !== 'Waiting')
          throw new HttpError(409, 'There is no provider reply to record for this application');
        const reason = String(b.reason || '').trim();
        if (!reason) throw bad("Enter the provider's reason");
        await tx(async (q) => {
          await q(
            "UPDATE applications SET status = 'Rejected', rejection_reason = $2 WHERE id = $1",
            [a.id, reason],
          );
          await tellMerchant(
            q,
            `${a.prov} rejected your application`,
            `${a.id}: ${reason}. Open the application to see what to correct and resubmit.`,
          );
          await audit(
            c.user.id,
            'application.provider_rejected',
            'application',
            a.id,
            { reason },
            c.ip,
            q,
          );
        });
        return { ok: true };
      }
    }
    throw bad('Unknown action');
  },
);

// ---- the merchant's provider connections and the on/off switch
route('GET', 'connections', { scope: 'merchant' }, async (c) => {
  if (!c.user.merchantId) return [];
  const rows = await query(
    'SELECT provider, beneficiary_id, bank_code, enabled, provider_ref, accepted_on FROM merchant_provider_accounts WHERE merchant_id = $1',
    [c.user.merchantId],
  );
  return rows.map((r) => ({
    prov: r.provider,
    benfId: r.beneficiary_id,
    bank: r.bank_code,
    on: r.enabled,
    ref: r.provider_ref,
    at: r.accepted_on,
  }));
});
route('POST', 'connections/toggle', { scope: 'merchant', perm: ['provider.toggle'] }, async (c) => {
  const b = await c.json();
  const [r] = await query(
    'UPDATE merchant_provider_accounts SET enabled = $3 WHERE merchant_id = $1 AND provider = $2 RETURNING provider',
    [c.user.merchantId, b.prov, !!b.on],
  );
  if (!r) throw new HttpError(404, 'This provider is not connected yet');
  await notify(
    'merchant',
    'Provider',
    `${b.prov} ${b.on ? 'enabled' : 'paused'}`,
    b.on
      ? 'Customers can pay through this provider again.'
      : 'New invoices and payment links will not use this provider until you enable it.',
    c.user.merchantId,
  );
  await audit(
    c.user.id,
    'provider.toggled',
    'merchant',
    c.user.merchantId!,
    { prov: b.prov, on: !!b.on },
    c.ip,
  );
  return { ok: true };
});
