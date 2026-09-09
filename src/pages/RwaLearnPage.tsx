import { Link } from 'react-router-dom'
import { FaqAccordion } from '@/components/rwa/FaqAccordion'
import { InvestorPortfolio } from '@/components/rwa/InvestorPortfolio'
import { RwaEducationView } from '@/components/rwa/RwaEducationView'
import { useAuth } from '@/lib/auth/AuthContext'
import { useRwa } from '@/lib/rwa/RwaContext'
import { useRecentActivity } from '@/lib/stellar/useRecentActivity'

export default function RwaLearnPage() {
  const { user } = useAuth()
  const { holdings } = useRwa()
  const activity = useRecentActivity(user?.publicKey ?? '')
  const canTokenize = user?.role === 'merchant' || user?.role === 'admin'
  const hasHoldings = holdings.length > 0

  return (
    <div className="space-y-8">
      {hasHoldings ? (
        <InvestorPortfolio activity={activity.items} compact />
      ) : null}

      <RwaEducationView />
      <div className="grid gap-2">
        {canTokenize ? (
          <Link
            to="/rwa/tokenizar"
            className="rounded-2xl bg-app-accent py-3 text-center text-sm font-medium"
          >
            Tokenizar mi activo
          </Link>
        ) : (
          <p className="rounded-[20px] bg-app-card px-4 py-3 text-sm text-app-muted">
            La tokenización la inicia una cuenta empresa. Si es inversionista, explore
            oportunidades abajo.
          </p>
        )}
        <Link
          to="/rwa/invertir"
          className="rounded-2xl bg-app-chip py-3 text-center text-sm font-medium"
        >
          Explorar oportunidades
        </Link>
      </div>
      <FaqAccordion />
    </div>
  )
}
