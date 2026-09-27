import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'

export default function RegisterPage() {
  const { register } = useAuth()

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Regístrate con email y contraseña. Elige Cliente o Empresa; la cuenta Stellar se crea sola en Testnet."
    >
      <RegisterForm onSubmit={register} formatError={readableError} />
      <p className="mt-6 text-center text-sm text-app-muted">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-medium text-app-accent">
          Iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
