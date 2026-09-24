import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth()

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Entra con email y contraseña, o con Google si ya tienes cuenta."
    >
      <LoginForm
        onSubmit={login}
        onGoogle={loginWithGoogle}
        formatError={readableError}
      />
      <p className="mt-6 text-center text-sm text-app-muted">
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="font-medium text-app-accent">
          Crear cuenta
        </Link>
      </p>
    </AuthLayout>
  )
}
