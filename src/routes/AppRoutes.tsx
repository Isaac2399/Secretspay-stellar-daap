import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute, ProtectedRoute, ConsumerRoute } from '@/routes/AuthGates'
import { AppShell } from '@/layouts/AppShell'
import HomePage from '@/pages/HomePage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import LoginPage from '@/pages/LoginPage'
import SignInPage from '@/pages/SignInPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import MapPage from '@/pages/MapPage'
import ProfilePage from '@/pages/ProfilePage'
import FaqPage from '@/pages/FaqPage'
import RegisterPage from '@/pages/RegisterPage'
import CardPage from '@/pages/CardPage'
import UnassignedDepositsPage from '@/pages/UnassignedDepositsPage'
import ClaimLookupPage from '@/pages/ClaimLookupPage'
import RwaLearnPage from '@/pages/RwaLearnPage'
import RwaTokenizePage from '@/pages/RwaTokenizePage'
import RwaMarketplacePage from '@/pages/RwaMarketplacePage'
import RwaPortfolioPage from '@/pages/RwaPortfolioPage'
import RwaStructuringPage from '@/pages/RwaStructuringPage'
import EventPage from '@/pages/EventPage'
import EventDisplayPage from '@/pages/EventDisplayPage'
import PartyPayLandingPage from '@/pages/PartyPayLandingPage'
import TractionPage from '@/pages/TractionPage'
import { useAuth } from '@/lib/auth/AuthContext'

export function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/partypay" element={<PartyPayLandingPage />} />
      <Route path="/traccion" element={<TractionPage />} />

      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/iniciar" element={<SignInPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin/unassigned-deposits" element={<UnassignedDepositsPage />} />
          <Route path="/admin/claim-lookup" element={<ClaimLookupPage />} />
          <Route element={<ConsumerRoute />}>
            <Route path="/profile/faq" element={<FaqPage />} />
            <Route path="/event" element={<EventPage />} />
            <Route path="/card" element={<CardPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/rwa" element={<RwaLearnPage />} />
            <Route path="/rwa/tokenizar" element={<RwaTokenizePage />} />
            <Route path="/rwa/invertir" element={<RwaMarketplacePage />} />
            <Route path="/rwa/dividendos" element={<RwaPortfolioPage />} />
            <Route path="/rwa/panel" element={<RwaStructuringPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="/event/display/:merchantId" element={<EventDisplayPage />} />

      <Route
        path="*"
        element={<Navigate to={user ? '/' : '/login'} replace />}
      />
    </Routes>
  )
}
