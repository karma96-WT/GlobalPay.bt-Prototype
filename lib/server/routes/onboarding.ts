import { tx } from '../db';
import { route, bad, HttpError } from '../registry';
import { notify, audit } from '../util';
import { MOBILE_RE, EMAIL_RE, CID_RE } from '../../validation';
import { PROVIDER_DOCS, docsFor } from '../../providers';

const MAX_FILE = 4 * 1024 * 1024;

/** Register a business: details, providers, documents or credentials, and consents, in one request. */
route('POST', 'business', { scope: 'merchant' }, async (c) => {
  if (c.user.merchantId) throw new HttpError(409, 'Your business is already registered');
  const f = await c.form();
  const m = JSON.parse(String(f.get('meta') || '{}'));
  const b = m.business || {};
  const need = (v: any, msg: string) => {
    if (!String(v || '').trim()) throw bad(msg);
  };
  need(b.name, 'Enter the registered business name');
  need(b.license, 'Enter the trade licence or registration number');
  need(b.address, 'Enter the business address');
  need(b.repName, "Enter the authorised representative's name");
  if (!CID_RE.test(String(b.repCid || ''))) throw bad('The CID must have 11 digits');
  if (!MOBILE_RE.test(String(b.phone || '')))
    throw bad('Contact number must be +975 followed by 17, 16 or 77 and six more digits');
  if (!EMAIL_RE.test(String(b.email || ''))) throw bad('Enter a valid business email');
  const cons = m.consent || {};
  if (!cons.accuracy || !cons.providers || !cons.terms || !cons.privacy)
    throw bad('Please accept all the required declarations');
  const providers: string[] = m.providers || [];
  if (!providers.length || providers.some((p) => !PROVIDER_DOCS[p]))
    throw bad('Choose at least one payment provider');
  const route_ = m.route === 'cred' ? 'cred' : 'docs';

  const files: Record<string, { name: string; type: string; size: number; data: Buffer }> = {};
  if (route_ === 'docs') {
    for (const p of providers)
      for (const d of docsFor(p, b.type)) {
        const file = f.get(`${p}|${d}`) as File | null;
        if (!file || typeof file === 'string' || !file.size) throw bad(`Upload "${d}" for ${p}`);
        if (!/(pdf|jpe?g|png)$/i.test(file.name)) throw bad(`"${d}" must be a PDF, JPG or PNG`);
        if (file.size > MAX_FILE) throw bad(`"${d}" is over 4 MB`);
        files[`${p}|${d}`] = {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          data: Buffer.from(await file.arrayBuffer()),
        };
      }
  } else for (const p of providers) need(m.creds?.[p], `Enter your existing ${p} merchant ID`);

  const ids = await tx(async (q) => {
    const [biz] = await q(
      `INSERT INTO merchants (legal_name, business_type, license_no, address, phone, email, website, rep_name, rep_cid, tech_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        b.name.trim(),
        b.type,
        b.license.trim(),
        b.address.trim(),
        b.phone,
        b.email.trim(),
        b.website?.trim() || null,
        b.repName.trim(),
        b.repCid,
        b.tech?.trim() || null,
      ],
    );
    await q('INSERT INTO subscriptions (merchant_id, plan, status) VALUES ($1, $2, $3)', [
      biz.id,
      'Basic',
      'Active',
    ]);
    await q(
      "UPDATE users SET merchant_id = $2, onboarding_stage = 'applied', email_consent = email_consent OR $3 WHERE id = $1",
      [c.user.id, biz.id, !!cons.email],
    );
    const out: string[] = [];
    for (const p of providers) {
      const [{ n }] = await q("SELECT nextval('app_seq') AS n");
      const id = `GP-${new Date().toISOString().slice(2, 4)}${new Date().toISOString().slice(5, 7)}-${String(n).padStart(4, '0')}`;
      await q(
        'INSERT INTO applications (id, merchant_id, provider, route, provided_merchant_id) VALUES ($1,$2,$3,$4,$5)',
        [id, biz.id, p, route_, route_ === 'cred' ? m.creds[p].trim() : null],
      );
      if (route_ === 'docs')
        for (const [i, d] of docsFor(p, b.type).entries()) {
          const x = files[`${p}|${d}`];
          await q(
            'INSERT INTO application_documents (application_id, doc_name, position, file_name, file_size, mime) VALUES ($1,$2,$3,$4,$5,$6)',
            [id, d, i, x.name, x.size, x.type],
          );
          await q('INSERT INTO files (application_id, doc_name, data) VALUES ($1,$2,$3)', [
            id,
            d,
            x.data,
          ]);
        }
      await notify(
        'operator',
        'Application',
        `New application from ${b.name}`,
        `${id} (${p}) is waiting for ${route_ === 'docs' ? 'document review' : 'credential checks'}.`,
        null,
        q,
      );
      await notify(
        'merchant',
        'Application',
        `Application ${id} submitted`,
        `An operator will check your ${route_ === 'docs' ? 'documents' : 'details'} and forward them to ${p}.`,
        biz.id,
        q,
      );
      out.push(id);
    }
    await audit(
      c.user.id,
      'business.registered',
      'merchant',
      biz.id,
      { providers, consents: cons },
      c.ip,
      q,
    );
    return out;
  });
  return { ok: true, applications: ids };
});

route('PATCH', 'business', { perm: ['business.edit'] }, async (c) => {
  const b = await c.json();
  if (b.phone && !MOBILE_RE.test(b.phone))
    throw bad('Phone must be +975 followed by 17, 16 or 77 and six more digits');
  if (b.email && !EMAIL_RE.test(b.email)) throw bad('Enter a valid business email');
  const { query } = await import('../db');
  await query(
    'UPDATE merchants SET address = COALESCE($2, address), phone = COALESCE($3, phone), email = COALESCE($4, email), website = $5 WHERE id = $1',
    [c.user.merchantId, b.address || null, b.phone || null, b.email || null, b.website || null],
  );
  await audit(c.user.id, 'business.updated', 'merchant', c.user.merchantId!, null, c.ip);
  return { ok: true };
});
