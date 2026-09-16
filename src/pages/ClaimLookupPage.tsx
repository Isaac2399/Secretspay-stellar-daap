import { Navigate } from 'react-router-dom'
import { ClaimLookupPanel } from '@/components/admin/ClaimLookupPanel'
import { useAuth } from '@/lib/auth/AuthContext'

export default function ClaimLookupPage() {
  const { user } = useAuth()
  if (!user) {
    return null
  }
  if (user.role !== 'admin' && user.role !== 'sinpe_ops' && user.role !== 'cashier') {
    return <Navigate to="/" replace />
  }
  return <ClaimLookupPanel />
}
