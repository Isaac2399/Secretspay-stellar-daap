import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'

export default function RegisterPage() {
  const { register, registerWithGoogle } = useAuth()

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Regístrate con email y contraseña o con Google. Elige Cliente o Empresa; la cuenta Stellar se crea sola en Testnet."
    >
      <RegisterForm
        onSubmit={register}
        onGoogle={registerWithGoogle}
        formatError={readableError}
      />
      <p className="mt-6 text-center text-sm text-app-muted">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-medium text-app-accent">
          Iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
