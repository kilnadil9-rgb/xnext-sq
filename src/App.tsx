import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'

// ── Layouts & guards ──────────────────────────────────────────────────────────
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { DashboardLayout } from './components/layouts/DashboardLayout'

// ── Auth pages ────────────────────────────────────────────────────────────────
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage'

// ── Invite ────────────────────────────────────────────────────────────────────
import { AcceptInvitePage } from './pages/invite/AcceptInvitePage'

// ── Dashboard pages ───────────────────────────────────────────────────────────
import { HomePage } from './pages/dashboard/HomePage'
import { ProfilePage } from './pages/dashboard/ProfilePage'
import { SettingsPage } from './pages/dashboard/SettingsPage'
import { OrganizationsPage } from './pages/dashboard/OrganizationsPage'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public: root redirect ──────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* ── Public: auth ───────────────────────────────────────────── */}
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

          {/* ── Semi-public: invite (auth check handled inside page) ───── */}
          <Route path="/invite/:token" element={<AcceptInvitePage />} />

          {/* ── Protected: dashboard ───────────────────────────────────── */}
          <Route element={<ProtectedRoute redirectTo="/auth/login" />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<HomePage />} />
              <Route path="/dashboard/profile" element={<ProfilePage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/organizations" element={<OrganizationsPage />} />

              {/* Catch-all inside dashboard → redirect home */}
              <Route path="/dashboard/*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Route>

          {/* ── Global catch-all ───────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
