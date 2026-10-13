// Super Admin portal: onboard/activate/decommission institutions.
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { api, ApiError } from '../../lib/api';
import { mediaUrl } from '../../lib/media';
import type { Tenant, TenantStatus } from '../../lib/types';

interface SuperAdminPortalProps {
  token: string;
}

function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

const STATUS_STYLES: Record<TenantStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-red-100 text-red-700',
};

export function SuperAdminPortal({ token }: SuperAdminPortalProps) {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.get<Tenant[]>('/superadmin/tenants', token);
      setTenants(list);
      setError(null);
    } catch (err) {
      setError(describeError(err, 'Could not load institutions.'));
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleActivate(tenantID: string) {
    try {
      await api.post(`/superadmin/tenants/${tenantID}/activate`, {}, token);
      reload();
    } catch (err) {
      setError(describeError(err, 'Could not activate institution.'));
    }
  }

  async function handleSuspend(tenantID: string) {
    if (!confirm('Suspend this institution? Staff and students will not be able to sign in until you activate it again.')) {
      return;
    }
    try {
      await api.post(`/superadmin/tenants/${tenantID}/suspend`, {}, token);
      reload();
    } catch (err) {
      setError(describeError(err, 'Could not suspend institution.'));
    }
  }

  async function handleDelete(tenantID: string) {
    if (!confirm('Decommission this institution? This deletes all of its data permanently.')) return;
    try {
      await api.del(`/superadmin/tenants/${tenantID}`, token);
      reload();
    } catch (err) {
      setError(describeError(err, 'Could not decommission institution.'));
    }
  }

  const pending = tenants?.filter((t) => t.Status === 'PENDING') ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Onboard institution</h2>
        <p className="mb-3 text-sm text-gray-500">
          Direct onboarding creates an <span className="font-medium text-gray-700">ACTIVE</span> school
          immediately. Schools that self-register appear below as PENDING until you activate them.
        </p>
        <AddTenantForm token={token} onCreated={reload} />
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {pending.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-900">
            Awaiting activation ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((tenant) => (
              <li
                key={tenant.TenantID}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{tenant.SchoolName}</p>
                  <p className="text-xs text-gray-500">
                    Institution code: {tenant.TenantCode}
                  </p>
                </div>
                <Button onClick={() => handleActivate(tenant.TenantID)}>Activate</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {tenants === null ? (
          <Spinner label="Loading institutions…" />
        ) : tenants.length === 0 ? (
          <p className="text-sm text-gray-500">No institutions onboarded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-2">School</th>
                <th className="pb-2">Institution code</th>
                <th className="pb-2">Status</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const logo = mediaUrl(tenant.LogoURL);
                return (
                  <tr key={tenant.TenantID} className="border-t border-gray-100">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {logo ? (
                          <img src={logo} alt="" className="h-8 w-8 rounded-md object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-[10px] font-bold text-gray-400">
                            —
                          </div>
                        )}
                        <span className="text-gray-900">{tenant.SchoolName}</span>
                      </div>
                    </td>
                    <td className="py-2 font-mono text-gray-500">{tenant.TenantCode}</td>
                    <td className="py-2">
                      <span
                        className={[
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[tenant.Status] ?? STATUS_STYLES.ACTIVE,
                        ].join(' ')}
                      >
                        {tenant.Status}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {(tenant.Status === 'PENDING' || tenant.Status === 'SUSPENDED') && (
                          <Button variant="secondary" onClick={() => handleActivate(tenant.TenantID)}>
                            Activate
                          </Button>
                        )}
                        {tenant.Status === 'ACTIVE' && (
                          <Button variant="secondary" onClick={() => handleSuspend(tenant.TenantID)}>
                            Suspend
                          </Button>
                        )}
                        <Button variant="danger" onClick={() => handleDelete(tenant.TenantID)}>
                          Decommission
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function AddTenantForm({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [schoolName, setSchoolName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const tenant = await api.post<Tenant>('/superadmin/tenants', { schoolName, adminUsername, adminPassword }, token);
      setSuccess(`${schoolName} onboarded and ACTIVE. Institution code: ${tenant.TenantCode}. Share it and the admin credentials with their staff.`);
      setSchoolName('');
      setAdminUsername('');
      setAdminPassword('');
      onCreated();
    } catch (err) {
      setError(describeError(err, 'Could not onboard institution.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      <TextField label="School name" name="schoolName" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Admin username"
          name="adminUsername"
          value={adminUsername}
          onChange={(e) => setAdminUsername(e.target.value)}
          required
        />
        <TextField
          label="Admin starting password"
          name="adminPassword"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner label="Onboarding…" /> : 'Onboard institution'}
      </Button>
    </form>
  );
}
