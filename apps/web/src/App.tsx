import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Button } from './components/Button';
import { useAuth, type Role } from './hooks/useAuth';
import { useBranding } from './hooks/useBranding';
import { mediaUrl } from './lib/media';
import { CredentialLogin } from './portals/Student/CredentialLogin';
import { SetStudentPassword } from './portals/Student/SetStudentPassword';
import { StudentPortal } from './portals/Student/StudentPortal';
import { SchoolAdminPortal } from './portals/SchoolAdmin/SchoolAdminPortal';
import { SuperAdminPortal } from './portals/SuperAdmin/SuperAdminPortal';

const HOME_BY_ROLE: Record<Role, string> = {
  STUDENT: '/vote',
  SCHOOL_ADMIN: '/school-admin',
  SUPER_ADMIN: '/super-admin',
};

export default function App() {
  const auth = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          auth.isAuthenticated && auth.role ? (
            <Navigate to={HOME_BY_ROLE[auth.role]} replace />
          ) : (
            <LoginScreen onLoggedIn={auth.login} />
          )
        }
      />
      <Route
        path="/vote"
        element={
          <RequireRole auth={auth} role="STUDENT">
            <Shell auth={auth}>
              {auth.mustChangePassword ? (
                <SetStudentPassword token={auth.token!} onPasswordChanged={auth.login} />
              ) : (
                <StudentPortal token={auth.token!} voterID={auth.voterID!} />
              )}
            </Shell>
          </RequireRole>
        }
      />
      <Route
        path="/school-admin"
        element={
          <RequireRole auth={auth} role="SCHOOL_ADMIN">
            <Shell auth={auth}>
              <SchoolAdminPortal token={auth.token!} />
            </Shell>
          </RequireRole>
        }
      />
      <Route
        path="/super-admin"
        element={
          <RequireRole auth={auth} role="SUPER_ADMIN">
            <Shell auth={auth}>
              <SuperAdminPortal token={auth.token!} />
            </Shell>
          </RequireRole>
        }
      />
      <Route
        path="/"
        element={
          auth.isAuthenticated && auth.role ? (
            <Navigate to={HOME_BY_ROLE[auth.role]} replace />
          ) : (
            <PlatformHome />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function PlatformHome() {
  const navigate = useNavigate();
  const toggleSuperAdminLogin = () => {
    const currentTab = new URLSearchParams(window.location.search).get('tab');
    navigate(currentTab === 'super-admin' ? '/login' : '/login?tab=super-admin');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-12">
      <section className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm sm:p-12">
        <div className="mb-8 flex items-center gap-3">
          <UniVoteMark
            className="h-12 w-12 rounded-xl text-sm"
            onDoubleClick={toggleSuperAdminLogin}
          />
          <span className="text-xl font-bold text-primary">UniVote</span>
        </div>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">For higher learning institutions</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Secure elections, managed by each institution.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
          UniVote gives every institution its own voter roll and elections. Schools manage candidates and register
          voters directly or sync them from their student information system.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
          >
            Institution sign in
          </Link>
          <Link
            to="/login?tab=register-school"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Register an institution
          </Link>
        </div>
        <p className="mt-8 text-xs text-gray-400">One platform. Separate, institution-managed voter rolls.</p>
      </section>
    </main>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const navigate = useNavigate();
  const toggleSuperAdminLogin = () => {
    const currentTab = new URLSearchParams(window.location.search).get('tab');
    navigate(currentTab === 'super-admin' ? '/login' : '/login?tab=super-admin');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <UniVoteMark
            className="mb-3 h-16 w-16 rounded-xl text-xl shadow-sm"
            onDoubleClick={toggleSuperAdminLogin}
          />
          <h1 className="text-2xl font-bold tracking-tight text-primary">UniVote</h1>
          <p className="mt-1 text-sm text-gray-500">Secure student elections</p>
        </div>
        <CredentialLogin onLoggedIn={onLoggedIn} />
      </div>
    </div>
  );
}

function UniVoteMark({
  className,
  onDoubleClick,
}: {
  className: string;
  onDoubleClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="UniVote"
      onDoubleClick={onDoubleClick}
      className={`flex select-none items-center justify-center bg-primary font-bold text-white ${className}`}
    >
      UV
    </button>
  );
}

function RequireRole({
  auth,
  role,
  children,
}: {
  auth: ReturnType<typeof useAuth>;
  role: Role;
  children: ReactNode;
}) {
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (auth.role !== role) {
    return <Navigate to={auth.role ? HOME_BY_ROLE[auth.role] : '/login'} replace />;
  }
  return <>{children}</>;
}

function Shell({ auth, children }: { auth: ReturnType<typeof useAuth>; children: ReactNode }) {
  const branding = useBranding();
  const isTenantUser = auth.role !== 'SUPER_ADMIN';
  const logo = isTenantUser ? mediaUrl(branding?.logoURL) : null;
  const schoolLabel = isTenantUser ? branding?.schoolName : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <header className="flex items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-black/5" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
              UV
            </div>
          )}
          <div className="leading-tight">
            <p className="text-sm font-bold text-primary">{schoolLabel || 'UniVote'}</p>
            {schoolLabel && <p className="text-[11px] text-gray-400">UniVote</p>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{auth.role}</span>
          <Button variant="secondary" onClick={auth.logout}>
            Log out
          </Button>
        </div>
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
