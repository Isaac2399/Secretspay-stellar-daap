import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestRoute, ProtectedRoute } from '@/routes/AuthGates'
import { AppShell } from '@/layouts/AppShell'
import HomePage from '@/pages/HomePage'
import LoginPage from '@/pages/LoginPage'
import MapPage from '@/pages/MapPage'
import ProfilePage from '@/pages/ProfilePage'
import RegisterPage from '@/pages/RegisterPage'
import CardPage from '@/pages/CardPage'
import RwaLearnPage from '@/pages/RwaLearnPage'
import RwaTokenizePage from '@/pages/RwaTokenizePage'
import RwaMarketplacePage from '@/pages/RwaMarketplacePage'
import RwaPortfolioPage from '@/pages/RwaPortfolioPage'
import RwaStructuringPage from '@/pages/RwaStructuringPage'
import { useAuth } from '@/lib/auth/AuthContext'

export function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/card" element={<CardPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/rwa" element={<RwaLearnPage />} />
          <Route path="/rwa/tokenizar" element={<RwaTokenizePage />} />
          <Route path="/rwa/invertir" element={<RwaMarketplacePage />} />
          <Route path="/rwa/dividendos" element={<RwaPortfolioPage />} />
          <Route path="/rwa/panel" element={<RwaStructuringPage />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={user ? '/' : '/login'} replace />}
      />
    </Routes>
  )
}
