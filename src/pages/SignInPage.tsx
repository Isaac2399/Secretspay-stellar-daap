import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'

export default function SignInPage() {
  const { login } = useAuth()

  return (
    <AuthLayout title="Iniciar sesión" description="Entra con tu email y contraseña.">
      <LoginForm onSubmit={login} formatError={readableError} />
      <p className="mt-4 text-center text-sm">
        <Link to="/forgot-password" className="font-medium text-app-accent">
          Olvidé mi contraseña
        </Link>
      </p>
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-medium text-app-accent">
          Volver
        </Link>
      </p>
    </AuthLayout>
  )
}
