// Credential (factor one) login for all three portals. Which endpoint is
// called depends on the selected tab; which portal the app renders next is
// decided entirely by the `role` claim inside the JWT this returns (see
// App.tsx / useAuth.ts) — this component itself doesn't need to know.
//
// Auth is owned by the Express API (custom JWTs against tenant tables in
// Supabase Postgres). Do not route through Supabase Auth — those tokens are
// not accepted by authGuard.
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { TextField } from '../../components/TextField';
import { api, ApiError } from '../../lib/api';
import type { LoginResponse } from '../../lib/types';
import {
  authenticateBiometricCredential,
  registerBiometricCredential,
} from '../../lib/webauthn';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

type Tab = 'student' | 'school-admin' | 'super-admin' | 'register-school';

type StudentLoginFlow =
  | { token: string; mode: 'change-password' | 'error' }
  | { token: string; mode: 'authenticate'; options: PublicKeyCredentialRequestOptionsJSON }
  | { token: string; mode: 'register'; options: PublicKeyCredentialCreationOptionsJSON };

interface CredentialLoginProps {
  onLoggedIn: (token: string) => void;
}

export function CredentialLogin({ onLoggedIn }: CredentialLoginProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(() => {
    if (requestedTab === 'register-school') return 'register-school';
    return requestedTab === 'super-admin' ? 'super-admin' : 'student';
  });

  useEffect(() => {
    if (requestedTab === 'super-admin') {
      setTab('super-admin');
    } else if (tab === 'super-admin') {
      setTab(requestedTab === 'register-school' ? 'register-school' : 'student');
    }
  }, [requestedTab, tab]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {tab === 'super-admin' ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Super Admin sign in</h2>
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className="text-xs text-gray-500 underline hover:text-gray-700"
            >
              Return to sign in
            </button>
          </div>
          <SuperAdminLoginForm onLoggedIn={onLoggedIn} />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-1 rounded-md bg-gray-100 p-1 text-xs font-medium">
            <TabButton active={tab === 'student'} onClick={() => setTab('student')}>
              Student
            </TabButton>
            <TabButton active={tab === 'school-admin'} onClick={() => setTab('school-admin')}>
              School Admin
            </TabButton>
            <TabButton active={tab === 'register-school'} onClick={() => setTab('register-school')}>
              Register school
            </TabButton>
          </div>

          {tab === 'student' && <StudentLoginForm onLoggedIn={onLoggedIn} />}
          {tab === 'school-admin' && <AdminLoginForm onLoggedIn={onLoggedIn} />}
          {tab === 'register-school' && <SchoolRegisterForm />}
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 rounded-md px-2 py-1.5 transition-colors',
        active ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function StudentLoginForm({ onLoggedIn }: CredentialLoginProps) {
  const [tenantCode, setTenantCode] = useState(() => api.getTenantCode());
  const [studentID, setStudentID] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginFlow, setLoginFlow] = useState<StudentLoginFlow | null>(null);

  async function prepareDeviceVerification(token: string, register = false, clearError = true) {
    setLoading(true);
    if (clearError) setError(null);
    try {
      if (register) {
        const options = await api.post<PublicKeyCredentialCreationOptionsJSON>(
          '/auth/webauthn/session/register/begin',
          undefined,
          token
        );
        setLoginFlow({ token, mode: 'register', options });
        return;
      }

      try {
        const options = await api.post<PublicKeyCredentialRequestOptionsJSON>(
          '/auth/webauthn/session/login/begin',
          undefined,
          token
        );
        setLoginFlow({ token, mode: 'authenticate', options });
      } catch (err) {
        if (!(err instanceof ApiError) || !err.message.includes('No biometric credential')) {
          throw err;
        }
        await prepareDeviceVerification(token, true);
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not prepare device verification. Please try again.'));
      setLoginFlow({ token, mode: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      api.setTenantCode(tenantCode);
      const result = await api.post<LoginResponse>('/auth/login', { studentID, password });
      setPassword('');
      if (result.mustChangePassword) {
        setLoginFlow({ token: result.token, mode: 'change-password' });
      } else {
        await prepareDeviceVerification(result.token);
      }
    } catch (err) {
      setError(errorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function saveNewPassword(event: FormEvent) {
    event.preventDefault();
    if (!loginFlow) return;
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post<{ token: string }>(
        '/auth/change-password',
        { newPassword },
        loginFlow.token
      );
      setNewPassword('');
      setConfirmPassword('');
      await prepareDeviceVerification(result.token);
    } catch (err) {
      setError(errorMessage(err, 'Could not update your password. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function refreshDeviceOptions() {
    if (!loginFlow || loginFlow.mode === 'change-password') return;
    await prepareDeviceVerification(loginFlow.token, loginFlow.mode === 'register');
  }

  async function completeDeviceVerification() {
    if (!loginFlow || (loginFlow.mode !== 'authenticate' && loginFlow.mode !== 'register')) return;

    setError(null);
    setLoading(true);
    try {
      if (loginFlow.mode === 'authenticate') {
        const assertionPromise = authenticateBiometricCredential(loginFlow.options);
        const credential = await assertionPromise;
        const result = await api.post<{ token: string }>(
          '/auth/webauthn/session/login/complete',
          { credential },
          loginFlow.token
        );
        onLoggedIn(result.token);
      } else {
        const attestationPromise = registerBiometricCredential(loginFlow.options);
        const credential = await attestationPromise;
        const result = await api.post<{ token: string }>(
          '/auth/webauthn/session/register/complete',
          { credential },
          loginFlow.token
        );
        onLoggedIn(result.token);
      }
    } catch (err) {
      setError(errorMessage(err, 'Device verification failed. Please try again.'));
      await prepareDeviceVerification(loginFlow.token, loginFlow.mode === 'register', false);
    } finally {
      setLoading(false);
    }
  }

  if (loginFlow) {
    return (
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}
        {loginFlow.mode === 'change-password' ? (
          <>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Set your password</h2>
              <p className="mt-1 text-xs text-gray-500">
                Choose a private password before verifying your device.
              </p>
            </div>
            <form onSubmit={saveNewPassword} className="space-y-3">
              <TextField
                label="New password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <TextField
                label="Confirm new password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <Button type="submit" fullWidth disabled={loading}>
                {loading ? <Spinner label="Updating password…" /> : 'Save password'}
              </Button>
            </form>
          </>
        ) : loginFlow.mode === 'authenticate' ? (
          <>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Verify your identity</h2>
              <p className="mt-1 text-xs text-gray-500">
                Confirm with your device’s biometric, passkey, or screen-lock security to finish signing in.
              </p>
            </div>
            <Button fullWidth disabled={loading || !loginFlow.options} onClick={completeDeviceVerification}>
              {loading ? <Spinner label="Waiting for device verification…" /> : 'Continue with device security'}
            </Button>
          </>
        ) : loginFlow.mode === 'register' ? (
          <>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Set up device security</h2>
              <p className="mt-1 text-xs text-gray-500">
                Register this device’s biometric, passkey, or screen-lock security to finish signing in.
              </p>
            </div>
            <Button fullWidth disabled={loading || !loginFlow.options} onClick={completeDeviceVerification}>
              {loading ? <Spinner label="Waiting for device setup…" /> : 'Set up device security'}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            {!error && <Spinner label="Preparing device verification…" />}
            <Button variant="secondary" fullWidth disabled={loading} onClick={refreshDeviceOptions}>
              {loading ? <Spinner label="Preparing…" /> : 'Try again'}
            </Button>
          </div>
        )}
        <button
          type="button"
          className="w-full text-center text-xs text-gray-500 underline hover:text-gray-700"
          onClick={() => {
            setLoginFlow(null);
            setError(null);
          }}
        >
          Return to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <TextField
        label="Institution code"
        name="tenantCode"
        value={tenantCode}
        onChange={(e) => setTenantCode(e.target.value)}
        autoComplete="organization"
        placeholder="Copperbelt University"
        hint="Enter your school name or the exact code shown when it was registered."
        required
      />
      <TextField
        label="Student ID"
        name="studentID"
        value={studentID}
        onChange={(e) => setStudentID(e.target.value)}
        autoComplete="username"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      <Button type="submit" fullWidth disabled={loading}>
        {loading ? <Spinner label="Logging in…" /> : 'Log in'}
      </Button>

      <p className="text-center text-xs text-gray-400">
        Your school administrator provides your institution code, Student ID, and temporary password.
      </p>
    </form>
  );
}

function AdminLoginForm({ onLoggedIn }: CredentialLoginProps) {
  const [tenantCode, setTenantCode] = useState(() => api.getTenantCode());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      api.setTenantCode(tenantCode);
      const result = await api.post<{ token: string; adminID: string }>('/auth/admin/login', {
        username,
        password,
      });
      onLoggedIn(result.token);
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <TextField
        label="Institution code"
        name="tenantCode"
        value={tenantCode}
        onChange={(e) => setTenantCode(e.target.value)}
        autoComplete="organization"
        placeholder="Copperbelt University"
        hint="Enter your school name or the exact code shown when it was registered."
        required
      />
      <TextField
        label="Username"
        name="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? <Spinner label="Logging in…" /> : 'Log in'}
      </Button>
      <p className="text-center text-xs text-gray-400">
        Enter the institution code provided when the school was approved. New registrations must be activated first.
      </p>
    </form>
  );
}

function SchoolRegisterForm() {
  const [schoolName, setSchoolName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const result = await api.post<{ message: string; tenantCode: string }>('/schools/register', {
        schoolName,
        adminUsername,
        adminPassword,
      });
      setSuccess(`${result.message} Institution code: ${result.tenantCode}. Save this code; staff will need it to sign in.`);
      setSchoolName('');
      setAdminUsername('');
      setAdminPassword('');
    } catch (err) {
      setError(errorMessage(err, 'Could not register school.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <TextField
        label="School name"
        name="schoolName"
        value={schoolName}
        onChange={(e) => setSchoolName(e.target.value)}
        required
      />
      <TextField
        label="Admin username"
        name="adminUsername"
        value={adminUsername}
        onChange={(e) => setAdminUsername(e.target.value)}
        required
      />
      <TextField
        label="Admin password"
        name="adminPassword"
        type="password"
        value={adminPassword}
        onChange={(e) => setAdminPassword(e.target.value)}
        minLength={8}
        required
      />
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? <Spinner label="Submitting…" /> : 'Submit registration'}
      </Button>
      <p className="text-center text-xs text-gray-400">
        Your school stays inactive until a Super Admin approves it.
      </p>
    </form>
  );
}

function SuperAdminLoginForm({ onLoggedIn }: CredentialLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Note: not under /auth — the Super Admin router is mounted before
      // tenant resolution and owns its own /login (see app.ts).
      const result = await api.post<{ token: string }>('/superadmin/login', { username, password });
      onLoggedIn(result.token);
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <TextField
        label="Username"
        name="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? <Spinner label="Logging in…" /> : 'Log in'}
      </Button>
    </form>
  );
}
