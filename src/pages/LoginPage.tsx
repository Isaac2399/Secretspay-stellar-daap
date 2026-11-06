import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { GuestDemoButton } from '@/components/guestDemo/GuestDemoButton'
import { useGuestDemoEntry } from '@/lib/auth/guestDemoStatus'

export default function LoginPage() {
  const { available, merchantReady } = useGuestDemoEntry()

  return (
    <AuthLayout title="Entrar" description="Elige cómo quieres entrar.">
      <div className="app-page">
        {available ? <GuestDemoButton merchantReady={merchantReady} /> : null}
        <p className="mt-6 text-center text-sm text-app-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/iniciar" className="font-medium text-app-accent">
            Iniciar sesión
          </Link>
        </p>
        <p className="mt-4 text-center text-sm text-app-muted">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-medium text-app-accent">
            Crear cuenta
          </Link>
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/traccion" className="font-medium text-app-accent">
            Ver pedidos con comprobante
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
