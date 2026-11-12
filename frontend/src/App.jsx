
import { useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import Hospitals from './pages/Hospitals'
import HospitalProfile from './pages/HospitalProfile'
import HospitalRequests from './pages/HospitalRequests'
import AdminRegistrationRequestDetail from './pages/AdminRegistrationRequestDetail'
import IncubatorUnits from './pages/IncubatorUnits'
import Equipment from './pages/Equipment'
import MedicalServices from './pages/MedicalServices'
import HospitalDataReviews from './pages/HospitalDataReviews'
import AdminDataReviews from './pages/AdminDataReviews'
import AdminDashboard from './pages/AdminDashboard'
import AdminHospitalDetail from './pages/AdminHospitalDetail'
import AdminUsers from './pages/AdminUsers'
import AdminProfile from './pages/AdminProfile'
import AdminReports from './pages/AdminReports'
import AdminSettings from './pages/AdminSettings'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminAbout from './pages/AdminAbout'
import AdminPlatformGuide from './pages/AdminPlatformGuide'
import HospitalDashboard from './pages/HospitalDashboard'
import HospitalStaff from './pages/HospitalStaff'
import AcceptStaffInvitation from './pages/AcceptStaffInvitation'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ChangePassword from './pages/ChangePassword'
import HospitalLifecycleAccess from './pages/HospitalLifecycleAccess'
import Login from './pages/Login'
import RegisterHospital from './pages/RegisterHospital'
import ErrorPage from './pages/ErrorPage'
import AdminShell from './components/AdminShell'
import HospitalFooter from './components/HospitalFooter'
import { AuthProvider } from './AuthContext'
import { useAuth } from './auth'
import { LanguageSwitcher, LocaleProvider, useLocale } from './i18n'
import './App.css'

function AuthStatusScreen({ message, onRetry }) {
  const { t } = useLocale()

  return (
    <main className="auth-screen">
      <section className="auth-status-card" role="status">
        <img
          className="login-logo"
          src="/dhana-logo-removebg-preview.png"
          alt={t('DANNA (ضنى) neonatal-care logo')}
        />
        <h1>{t(message)}</h1>
        {onRetry && (
          <button type="button" className="login-submit" onClick={onRetry}>
            {t('Retry connection')}
          </button>
        )}
      </section>
    </main>
  )
}

function ProtectedRoute({ children }) {
  const { user, status, error, refreshUser, sessionExpired } = useAuth()
  const { t } = useLocale()
  const location = useLocation()
  const protectedPaths = [
    '/',
    '/hospitals',
    '/hospital-requests',
    '/data-reviews',
    '/incubators',
    '/equipment',
    '/services',
    '/staff',
    '/hospital-profile',
    '/hospital-corrections',
    '/change-password',
    '/users',
    '/profile',
    '/settings',
    '/reports',
    '/audit-logs',
    '/about-danna',
    '/platform-guide',
    '/404',
    '/something-went-wrong',
  ]
  const isKnownPath = protectedPaths.includes(location.pathname)
    || /^\/hospitals\/\d+$/.test(location.pathname)
    || /^\/hospital-requests\/\d+$/.test(location.pathname)

  if (location.pathname === '/something-went-wrong') {
    return <ErrorPage type="failure" />
  }

  if (location.pathname === '/404' || !isKnownPath) {
    return <ErrorPage />
  }

  if (status === 'checking') {
    return <AuthStatusScreen message="Checking your secure session…" />
  }

  if (status === 'error') {
    return <AuthStatusScreen message={error} onRetry={refreshUser} />
  }

  // `user` is deliberately required in addition to the state flag. The
  // current-user endpoint is the only authority for rendering protected UI.
  if (status !== 'authenticated' || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location, sessionExpired }}
      />
    )
  }

  const restrictedHospitalAdmin = user?.role === 'hospital_admin'
    && ((user.status === 'rejected' && user.hospital?.status === 'rejected')
      || (user.status === 'suspended' && user.hospital?.status === 'suspended'))

  if (user?.status !== 'active' && !restrictedHospitalAdmin) {
    return (
      <AuthStatusScreen
        message={
          user?.status === 'suspended'
            ? t('Your account is suspended. Contact DANNA support.')
            : t('Your account is not authorized to access this workspace.')
        }
      />
    )
  }

  return children
}

function RoleRoute({ role, children }) {
  const { user, status } = useAuth()
  if (status !== 'authenticated' || !user || user.role !== role) {
    return <Navigate to="/" replace />
  }
  return children
}

function GuestRoute({ children }) {
  const { status, error, refreshUser } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return <AuthStatusScreen message="Checking your secure session…" />
  }

  if (status === 'error') {
    return <AuthStatusScreen message={error} onRetry={refreshUser} />
  }

  if (status === 'authenticated') {
    const destination = location.state?.from
    return (
      <Navigate
        to={
          destination?.pathname
            ? {
                pathname: destination.pathname,
                search: destination.search || '',
                hash: destination.hash || '',
              }
            : '/'
        }
        replace
      />
    )
  }

  return children
}

function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { direction, t } = useLocale()
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const lifecycleRestricted = user?.role === 'hospital_admin'
    && ['rejected', 'suspended'].includes(user?.status)
    && user?.hospital?.status === user.status

  if (lifecycleRestricted) {
    return (
      <div className="dhana-app hospital-lifecycle-shell" dir={direction}>
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-logo" src="/dhana-logo-removebg-preview.png" alt={t('DANNA logo')} />
            <div><h2>DANNA</h2><span>{t('ضنى · Neonatal Care')}</span></div>
          </div>
          <div className="menu-label">{t('ACCOUNT STATUS')}</div>
          <nav className="navigation">
            <Link className={`nav-item ${location.pathname !== '/hospital-corrections' ? 'active' : ''}`} to="/">
              <span>ⓘ</span> {t('Decision details')}
            </Link>
            {user.status === 'rejected' && (
              <Link className={`nav-item ${location.pathname === '/hospital-corrections' ? 'active' : ''}`} to="/hospital-corrections">
                <span>✎</span> {t('Correct registration')}
              </Link>
            )}
            <button
              className="nav-item workspace-logout"
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <span>↪</span> {t(isLoggingOut ? 'Signing out…' : 'Sign out')}
            </button>
          </nav>
          {logoutError && <p className="sidebar-feedback" role="alert">{t(logoutError)}</p>}
        </aside>
        <Routes>
          <Route path="/" element={<HospitalLifecycleAccess status={user.status} />} />
          <Route
            path="/hospital-corrections"
            element={
              user.status === 'rejected'
                ? <HospitalProfile rejectedRegistration />
                : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <HospitalFooter />
      </div>
    )
  }

  if (user?.role !== 'super_admin') {
    return (
      <AdminShell
        isLoggingOut={isLoggingOut}
        logoutError={logoutError}
        onLogout={handleLogout}
        user={user}
      >
        <Routes>
          <Route path="/" element={<HospitalDashboard />} />
          <Route path="/hospitals" element={<Hospitals />} />
          <Route
            path="/hospital-profile"
            element={['hospital_admin', 'hospital_staff'].includes(user?.role) ? <HospitalProfile /> : <Hospitals />}
          />
          <Route path="/incubators" element={<IncubatorUnits />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/services" element={<MedicalServices />} />
          <Route path="/data-reviews" element={<HospitalDataReviews />} />
          <Route path="/staff" element={<HospitalStaff />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AdminShell>
    )
  }

  async function handleLogout() {
    setLogoutError('')
    setIsLoggingOut(true)

    try {
      await logout()
      navigate('/login', {
        replace: true,
        state: { message: t('You have been signed out.') },
      })
    } catch (error) {
      setLogoutError(error.message || t('Sign out failed. Please try again.'))
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <AdminShell
      isLoggingOut={isLoggingOut}
      logoutError={logoutError}
      onLogout={handleLogout}
      user={user}
    >
      <Routes>
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/hospitals" element={<Hospitals />} />
        <Route
          path="/hospitals/:hospitalId"
          element={
            <RoleRoute role="super_admin">
              <AdminHospitalDetail />
            </RoleRoute>
          }
        />
        <Route
          path="/hospital-requests"
          element={
            <RoleRoute role="super_admin">
              <HospitalRequests />
            </RoleRoute>
          }
        />
        <Route
          path="/hospital-requests/:requestId"
          element={
            <RoleRoute role="super_admin">
              <AdminRegistrationRequestDetail />
            </RoleRoute>
          }
        />
        <Route
          path="/data-reviews"
          element={
            <RoleRoute role="super_admin">
              <AdminDataReviews />
            </RoleRoute>
          }
        />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route
          path="/profile"
          element={
            <RoleRoute role="super_admin">
              <AdminProfile />
            </RoleRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <RoleRoute role="super_admin">
              <AdminSettings />
            </RoleRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <RoleRoute role="super_admin">
              <AdminReports />
            </RoleRoute>
          }
        />
        <Route
          path="/audit-logs"
          element={
            <RoleRoute role="super_admin">
              <AdminAuditLogs />
            </RoleRoute>
          }
        />
        <Route
          path="/about-danna"
          element={
            <RoleRoute role="super_admin">
              <AdminAbout />
            </RoleRoute>
          }
        />
        <Route
          path="/platform-guide"
          element={
            <RoleRoute role="super_admin">
              <AdminPlatformGuide />
            </RoleRoute>
          }
        />
        <Route path="/users" element={<AdminUsers />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminShell>
  )
}

function AppRoutes() {
  const { user } = useAuth()
  const location = useLocation()
  const isPublicRoute = [
    '/login',
    '/register-hospital',
    '/accept-staff-invitation',
    '/forgot-password',
    '/reset-password',
  ].includes(location.pathname)
  const restrictedHospitalAdmin = user?.role === 'hospital_admin'
    && ['rejected', 'suspended'].includes(user.status)
    && user.hospital?.status === user.status
  const isErrorRoute = ['/404', '/something-went-wrong'].includes(location.pathname)
    || (!isPublicRoute && ![
      '/',
      '/hospitals',
      '/hospital-requests',
      '/data-reviews',
      '/incubators',
      '/equipment',
      '/services',
      '/staff',
      '/hospital-profile',
      '/hospital-corrections',
      '/change-password',
      '/users',
      '/profile',
      '/settings',
      '/reports',
      '/audit-logs',
      '/about-danna',
      '/platform-guide',
    ].includes(location.pathname)
      && !/^\/hospitals\/\d+$/.test(location.pathname)
      && !/^\/hospital-requests\/\d+$/.test(location.pathname))
  const showLanguageSwitcher = !isErrorRoute
    && (!user || isPublicRoute || restrictedHospitalAdmin || user.status !== 'active')

  return (
    <>
      {showLanguageSwitcher && <LanguageSwitcher />}
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <Login />
            </GuestRoute>
          }
        />
        <Route
          path="/register-hospital"
          element={
            <GuestRoute>
              <RegisterHospital />
            </GuestRoute>
          }
        />
        <Route path="/accept-staff-invitation" element={<AcceptStaffInvitation />} />
        <Route
          path="/forgot-password"
          element={
            <GuestRoute>
              <ForgotPassword />
            </GuestRoute>
          }
        />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  )
}

function App() {
  return (
    <LocaleProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </LocaleProvider>
  )
}

export default App
