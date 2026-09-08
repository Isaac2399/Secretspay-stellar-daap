import { TokenizationWizard } from '@/components/rwa/TokenizationWizard'
import { useAuth } from '@/lib/auth/AuthContext'
import { Link } from 'react-router-dom'

export default function RwaTokenizePage() {
  const { user } = useAuth()

  if (user?.role === 'customer') {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Tokenizar mi activo</h1>
        <p className="text-sm text-app-muted">
          Esta vía es para empresas originadoras. Con una cuenta de cliente puede invertir
          en activos ya publicados.
        </p>
        <Link to="/rwa/invertir" className="inline-block text-sm text-app-accent">
          Explorar oportunidades
        </Link>
      </section>
    )
  }

  return <TokenizationWizard />
}
