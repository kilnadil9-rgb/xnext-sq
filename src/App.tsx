import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { LoadingState } from './components/ui/LoadingState'

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
import { QuestsPage } from './pages/dashboard/QuestsPage'
import { QuestDetailPage } from './pages/dashboard/QuestDetailPage'
import { DreamListPage } from './pages/dashboard/DreamListPage'
import { PulsePage } from './pages/dashboard/PulsePage'

// ── Legal / Trust pages (public + consent) ────────────────────────────────────
import { PrivacyPolicyPage } from './pages/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/legal/TermsOfServicePage'
import { CommunityGuidelinesPage } from './pages/legal/CommunityGuidelinesPage'
import { ProductPhilosophyPage } from './pages/legal/ProductPhilosophyPage'
import { DataRequestsPage } from './pages/legal/DataRequestsPage'
import { ConsentPage } from './pages/legal/ConsentPage'

// Lazy: keeps the Google Maps JS SDK out of the main bundle
const MapPage = lazy(() => import('./pages/dashboard/MapPage'))
const MyQuestsPage = lazy(() => import('./pages/dashboard/MyQuestsPage'))
const CreateQuestPage = lazy(() => import('./pages/dashboard/CreateQuestPage'))
const EditQuestPage = lazy(() => import('./pages/dashboard/EditQuestPage'))
const CompletedQuestsPage = lazy(
  () => import('./pages/dashboard/CompletedQuestsPage'),
)
const PreferencesPage = lazy(() => import('./pages/dashboard/PreferencesPage'))

const suspense = (node: ReactNode) => (
  <Suspense fallback={<LoadingState fullScreen />}>{node}</Suspense>
)

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

          {/* ── Public legal / trust pages (accessible pre- or post-auth) ─ */}
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms-of-service" element={<TermsOfServicePage />} />
          <Route path="/community-guidelines" element={<CommunityGuidelinesPage />} />
          <Route path="/philosophy" element={<ProductPhilosophyPage />} />
          <Route path="/data-requests" element={<DataRequestsPage />} />

          {/* ── Protected: dashboard + consent gate ────────────────────── */}
          <Route element={<ProtectedRoute redirectTo="/auth/login" />}>
            <Route path="/consent" element={<ConsentPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<HomePage />} />
              <Route path="/dashboard/profile" element={<ProfilePage />} />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/organizations" element={<OrganizationsPage />} />
              <Route path="/dashboard/quests" element={<QuestsPage />} />
              <Route path="/dashboard/quests/new" element={suspense(<CreateQuestPage />)} />
              <Route path="/dashboard/quests/mine" element={suspense(<MyQuestsPage />)} />
              <Route path="/dashboard/quests/:id/edit" element={suspense(<EditQuestPage />)} />
              <Route path="/dashboard/quests/:id" element={<QuestDetailPage />} />
              <Route path="/dashboard/dream-list" element={<DreamListPage />} />
              <Route path="/dashboard/completed" element={suspense(<CompletedQuestsPage />)} />
              <Route path="/dashboard/preferences" element={suspense(<PreferencesPage />)} />
              <Route path="/dashboard/pulse" element={<PulsePage />} />
              <Route
                path="/dashboard/map"
                element={
                  <Suspense fallback={<LoadingState fullScreen />}>
                    <MapPage />
                  </Suspense>
                }
              />

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
