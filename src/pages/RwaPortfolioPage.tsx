import { InvestorPortfolio } from '@/components/rwa/InvestorPortfolio'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRecentActivity } from '@/lib/stellar/useRecentActivity'

export default function RwaPortfolioPage() {
  const { user } = useAuth()
  const activity = useRecentActivity(user?.publicKey ?? '')

  return <InvestorPortfolio activity={activity.items} />
}
