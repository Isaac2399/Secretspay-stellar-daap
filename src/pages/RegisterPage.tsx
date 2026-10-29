import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'
import { submitMerchantApplication } from '@/lib/merchantApplications'

export default function RegisterPage() {
  const { register } = useAuth()
  const [sentName, setSentName] = useState<string | null>(null)

  if (sentName) {
    return (
      <AuthLayout
        title="Solicitud enviada"
        description="El super admin ya puede aceptarla o rechazarla."
      >
        <div className="space-y-4 rounded-[28px] bg-app-card p-5">
          <p className="text-sm leading-relaxed text-white/85">
            Recibimos la solicitud de <span className="font-medium">{sentName}</span>.
            La cuenta de empresa se crea solo si la aceptan. Cuando eso pase, entra
            con el mismo email y contraseña.
          </p>
          <Link
            to="/login"
            className="block rounded-2xl bg-app-accent py-3 text-center text-sm font-medium text-white"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Los clientes entran al momento. Las empresas envían una solicitud y el super admin la acepta o la rechaza."
    >
      <RegisterForm
        formatError={readableError}
        onSubmit={async (input) => {
          if (input.kind === 'customer') {
            await register({
              email: input.email,
              password: input.password,
              role: 'customer',
            })
            return
          }
          const sent = await submitMerchantApplication(input)
          setSentName(sent.businessName)
        }}
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
