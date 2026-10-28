'use client';
import { useState } from 'react';
import { Badge, PasswordField, PhoneInput, Toast, useToast, useRun, full } from '@/components/ui';
import { api, useApi, fmtDate } from '@/lib/api';
import { MERCHANT_PERMS } from '@/lib/rbac';
import { EMAIL_RE, LOCAL_MOBILE_RE, passwordProblems } from '@/lib/validation';

/**
 * Team access. GlobalPay.bt defines the permissions and four standard roles; the Owner assigns a role to each member
 * and may build custom roles. The Owner sets the member's email and a temporary password; the member must change it on first sign-in.
 */
export default function Team({ goPlan }: { goPlan: () => void }) {
  const { data, mutate } = useApi<any>('team', 8000);
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [f, setF] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    roleCode: 'MERCHANT_FINANCE',
  });
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  const [draft, setDraft] = useState<{ name: string; perms: string[] } | null>(null);
  if (!data) return null;
  const roleName = (c: string) => data.roles.find((r: any) => r.code === c)?.name || c;
  const full_ = data.limit !== null && data.used >= data.limit;
  const invalid =
    f.name.trim().length < 2 ||
    !EMAIL_RE.test(f.email) ||
    (f.mobile && !LOCAL_MOBILE_RE.test(f.mobile)) ||
    !!passwordProblems(f.password).length;
  const owners = data.members.filter(
    (m: any) => m.roleCode === 'MERCHANT_OWNER' && m.status === 'active',
  ).length;

  return (
    <>
      <h3>Team members</h3>
      <div className="line" style={{ border: 0 }}>
        <small>
          {data.used} of {data.limit ?? 'unlimited'} seats used on the {data.plan} plan
        </small>
        {data.limit !== null && (
          <div className="bar" style={{ width: 160 }}>
            <i style={{ width: Math.min(100, (data.used / data.limit) * 100) + '%' }} />
          </div>
        )}
      </div>
      {data.members.map((m: any) => {
        const lastOwner = m.roleCode === 'MERCHANT_OWNER' && m.status === 'active' && owners <= 1;
        return (
          <div className="line" key={m.id} style={{ alignItems: 'flex-start' }}>
            <div>
              <b>{m.name}</b>
              {m.me && ' (you)'} <Badge s={m.status === 'active' ? 'Active' : 'Deactivated'} />
              {m.mustChange && (
                <span className="badge b-warn" style={{ marginLeft: 6 }}>
                  Temporary password
                </span>
              )}
              <br />
              <small>
                {m.email}
                {m.mobile && ` · ${m.mobile}`} · last sign-in{' '}
                {m.lastLogin ? fmtDate(m.lastLogin) : 'never'}
              </small>
              {reset?.id === m.id && (
                <div style={{ marginTop: 8, maxWidth: 360 }}>
                  <PasswordField
                    label="New temporary password"
                    value={reset.password}
                    onChange={(v) => setReset({ id: m.id, password: v })}
                    rules
                  />
                  <p style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={!!passwordProblems(reset.password).length}
                      onClick={async () => {
                        if (
                          await run(
                            () => api(`team/${m.id}`, 'PATCH', { password: reset.password }),
                            'Temporary password set. They must change it at next sign-in.',
                          )
                        )
                          setReset(null);
                      }}
                    >
                      Save
                    </button>
                    <button className="alt" onClick={() => setReset(null)}>
                      Cancel
                    </button>
                  </p>
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <select
                style={{ width: 150 }}
                value={m.roleCode}
                disabled={lastOwner || m.status !== 'active'}
                onChange={(e) =>
                  run(
                    () =>
                      api(`team/${m.id}`, 'PATCH', { roleCode: e.target.value }).then(() =>
                        mutate(),
                      ),
                    'Role changed',
                  )
                }
              >
                {data.roles.map((r: any) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button className="alt" onClick={() => setReset({ id: m.id, password: '' })}>
                Reset password
              </button>
              {!m.me && (
                <button
                  className="alt"
                  disabled={lastOwner}
                  onClick={() =>
                    run(
                      () =>
                        api(`team/${m.id}`, 'PATCH', {
                          status: m.status === 'active' ? 'deactivated' : 'active',
                        }).then(() => mutate()),
                      m.status === 'active' ? 'Member removed' : 'Member reactivated',
                    )
                  }
                >
                  {m.status === 'active' ? 'Remove' : 'Reactivate'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="card" style={{ marginTop: 16, background: 'var(--soft)', border: 0 }}>
        <h3>Add a team member</h3>
        {full_ ? (
          <>
            <p>
              Your {data.plan} plan includes {data.limit} team seats and all are in use. Upgrade
              your plan to add more members.
            </p>
            <button onClick={goPlan}>Choose a plan</button>
          </>
        ) : (
          <>
            <ol style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 14, color: 'var(--mut)' }}>
              <li>Enter their details and choose a role.</li>
              <li>Set a temporary password and share it with them privately.</li>
              <li>When they first sign in, GlobalPay.bt asks them to choose their own password.</li>
            </ol>
            <div className="row">
              <div>
                <label>Full name *</label>
                <input
                  value={f.name}
                  placeholder="Tshewang Lhamo"
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                />
              </div>
              <div>
                <label>Email address * (their sign-in)</label>
                <input
                  value={f.email}
                  placeholder="tshewang@druktrails.bt"
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                />
              </div>
            </div>
            <div className="row">
              <div>
                <PhoneInput
                  label="Mobile (optional)"
                  value={f.mobile}
                  onChange={(v) => setF({ ...f, mobile: v })}
                />
              </div>
              <div>
                <label>Role *</label>
                <select
                  value={f.roleCode}
                  onChange={(e) => setF({ ...f, roleCode: e.target.value })}
                >
                  {data.roles.map((r: any) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <small>{data.roles.find((r: any) => r.code === f.roleCode)?.desc}</small>
              </div>
            </div>
            <PasswordField
              label="Temporary password *"
              value={f.password}
              onChange={(v) => setF({ ...f, password: v })}
              rules
            />
            <p>
              <button
                disabled={!!invalid}
                onClick={async () => {
                  if (
                    await run(
                      () =>
                        api('team', 'POST', { ...f, mobile: f.mobile ? full(f.mobile) : '' }).then(
                          () => mutate(),
                        ),
                      'Member added. They must change the password at first sign-in.',
                    )
                  )
                    setF({ name: '', email: '', mobile: '', password: '', roleCode: f.roleCode });
                }}
              >
                Add member
              </button>
            </p>
          </>
        )}
      </div>

      <h3 style={{ marginTop: 24 }}>Roles and permissions</h3>
      <p>
        <small>
          GlobalPay.bt defines the permissions and four standard roles. You assign them to members.
          The Owner can also create custom roles. A role only ever grants what is ticked here.
        </small>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="matrix">
          <thead>
            <tr>
              <th>Permission</th>
              {data.roles.map((r: any) => (
                <th key={r.code}>{r.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MERCHANT_PERMS.map(([code, label]) => (
              <tr key={code}>
                <td>{label}</td>
                {data.roles.map((r: any) => (
                  <td key={r.code}>{r.perms.includes(code) ? '✔' : '–'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.roles
        .filter((r: any) => !r.system)
        .map((r: any) => (
          <div className="line" key={r.code}>
            <span>
              <b>{r.name}</b> <small>custom role</small>
            </span>
            <button
              className="alt"
              onClick={() =>
                run(() => api(`roles/${r.code}`, 'DELETE').then(() => mutate()), 'Role deleted')
              }
            >
              Delete role
            </button>
          </div>
        ))}
      {!draft ? (
        <p>
          <button className="alt" onClick={() => setDraft({ name: '', perms: [] })}>
            + Create custom role
          </button>
        </p>
      ) : (
        <div className="card" style={{ background: 'var(--soft)', border: 0, marginTop: 12 }}>
          <label>Role name</label>
          <input
            value={draft.name}
            placeholder="Sales"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <label>Permissions</label>
          {MERCHANT_PERMS.filter(([c]) => !['team.manage', 'plan.manage'].includes(c)).map(
            ([code, label]) => (
              <label
                key={code}
                style={{ display: 'flex', gap: 8, color: 'inherit', margin: '4px 0' }}
              >
                <input
                  type="checkbox"
                  checked={draft.perms.includes(code)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      perms: e.target.checked
                        ? [...draft.perms, code]
                        : draft.perms.filter((x) => x !== code),
                    })
                  }
                />
                {label}
              </label>
            ),
          )}
          <small>Only the Owner role can manage the team and the plan.</small>
          <p style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={!draft.name.trim() || !draft.perms.length}
              onClick={async () => {
                if (
                  await run(
                    () => api('roles', 'POST', draft).then(() => mutate()),
                    'Custom role created',
                  )
                )
                  setDraft(null);
              }}
            >
              Save role
            </button>
            <button className="alt" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </p>
        </div>
      )}
      <Toast m={msg} />
    </>
  );
}
