'use client';
import { useState } from 'react';
import { Badge, PasswordField, PhoneInput, Toast, useToast, useRun, full } from '@/components/ui';
import { api, useApi, fmtDate } from '@/lib/api';
import { EMAIL_RE, LOCAL_MOBILE_RE, passwordProblems } from '@/lib/validation';

/** Staff accounts. The admin sets a temporary password; the employee must change it at first sign-in. */
export default function Employees({ me }: { me: any }) {
  const { data, mutate } = useApi<any>('admin/employees');
  const [msg, toast] = useToast();
  const run = useRun(toast);
  const [f, setF] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    roleCode: 'OPERATOR',
  });
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);
  if (!data) return null;
  const invalid =
    f.name.trim().length < 2 ||
    !EMAIL_RE.test(f.email) ||
    !LOCAL_MOBILE_RE.test(f.mobile) ||
    !!passwordProblems(f.password).length;
  return (
    <>
      <div className="card">
        <h3>Staff</h3>
        {data.staff.map((s: any) => (
          <div className="line" key={s.id} style={{ alignItems: 'flex-start' }}>
            <div>
              <b>{s.name}</b>
              {s.id === me.id && ' (you)'}{' '}
              <Badge s={s.status === 'active' ? 'Active' : 'Deactivated'} />
              {s.mustChange && (
                <span className="badge b-warn" style={{ marginLeft: 6 }}>
                  Temporary password
                </span>
              )}
              <br />
              <small>
                {s.email} · {s.mobile} · last sign-in {s.lastLogin ? fmtDate(s.lastLogin) : 'never'}
              </small>
              {reset?.id === s.id && (
                <div style={{ marginTop: 8, maxWidth: 360 }}>
                  <PasswordField
                    label="New temporary password"
                    value={reset.password}
                    onChange={(v) => setReset({ id: s.id, password: v })}
                    rules
                  />
                  <p style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={!!passwordProblems(reset.password).length}
                      onClick={async () => {
                        if (
                          await run(
                            () =>
                              api(`admin/employees/${s.id}`, 'PATCH', { password: reset.password }),
                            'Temporary password set',
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
                style={{ width: 130 }}
                value={s.roleCode}
                disabled={s.id === me.id}
                onChange={(e) =>
                  run(
                    () =>
                      api(`admin/employees/${s.id}`, 'PATCH', { roleCode: e.target.value }).then(
                        () => mutate(),
                      ),
                    'Role changed',
                  )
                }
              >
                <option value="ADMIN">Admin</option>
                <option value="OPERATOR">Operator</option>
              </select>
              <button className="alt" onClick={() => setReset({ id: s.id, password: '' })}>
                Reset password
              </button>
              {s.id !== me.id && (
                <button
                  className="alt"
                  onClick={() =>
                    run(
                      () =>
                        api(`admin/employees/${s.id}`, 'PATCH', {
                          status: s.status === 'active' ? 'deactivated' : 'active',
                        }).then(() => mutate()),
                      s.status === 'active' ? 'Employee deactivated' : 'Employee reactivated',
                    )
                  }
                >
                  {s.status === 'active' ? 'Deactivate' : 'Reactivate'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ background: 'var(--soft)', border: 0 }}>
        <h3>Add an employee</h3>
        <div className="row">
          <div>
            <label>Full name *</label>
            <input
              value={f.name}
              placeholder="Choki Zangmo"
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <div>
            <label>Work email *</label>
            <input
              value={f.email}
              placeholder="choki@globalpay.bt"
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </div>
        </div>
        <div className="row">
          <div>
            <PhoneInput
              label="Mobile"
              required
              value={f.mobile}
              onChange={(v) => setF({ ...f, mobile: v })}
            />
          </div>
          <div>
            <label>Role *</label>
            <select value={f.roleCode} onChange={(e) => setF({ ...f, roleCode: e.target.value })}>
              <option value="OPERATOR">
                Operator (reviews documents, forwards, answers support)
              </option>
              <option value="ADMIN">Admin (staff, merchants, subscriptions, feedback)</option>
            </select>
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
            disabled={invalid}
            onClick={async () => {
              if (
                await run(
                  () =>
                    api('admin/employees', 'POST', { ...f, mobile: full(f.mobile) }).then(() =>
                      mutate(),
                    ),
                  'Employee added. They must change the password at first sign-in.',
                )
              )
                setF({ name: '', email: '', mobile: '', password: '', roleCode: f.roleCode });
            }}
          >
            Add employee
          </button>
        </p>
      </div>
      <Toast m={msg} />
    </>
  );
}
