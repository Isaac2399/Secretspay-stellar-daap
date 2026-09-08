import { StructuringDashboard } from '@/components/rwa/StructuringDashboard'
import { useAuth } from '@/lib/auth/AuthContext'
import { Navigate } from 'react-router-dom'

export default function RwaStructuringPage() {
  const { user } = useAuth()
  if (user?.role !== 'admin') {
    return <Navigate to="/rwa" replace />
  }
  return <StructuringDashboard />
}
