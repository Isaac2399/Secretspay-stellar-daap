import { Navigate, Outlet } from 'react-router-dom'
import { EntrySplash } from '@/components/guestDemo/EntrySplash'
import { useAuth } from '@/lib/auth/AuthContext'
import { isEventStaffRole } from '@/lib/auth/roles'

export function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <EntrySplash />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export function GuestRoute() {
  const { user, loading } = useAuth()

  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export function ConsumerRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <EntrySplash />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (isEventStaffRole(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
