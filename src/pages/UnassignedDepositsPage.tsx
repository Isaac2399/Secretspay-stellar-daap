import { Navigate } from 'react-router-dom'
import { UnassignedDepositsPanel } from '@/components/admin/UnassignedDepositsPanel'
import { useAuth } from '@/lib/auth/AuthContext'

export default function UnassignedDepositsPage() {
  const { user } = useAuth()
  if (!user) {
    return null
  }
  if (user.role !== 'admin' && user.role !== 'sinpe_ops' && user.role !== 'cashier') {
    return <Navigate to="/" replace />
  }
  return <UnassignedDepositsPanel />
}
