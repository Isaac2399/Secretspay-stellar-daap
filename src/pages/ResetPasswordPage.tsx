import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { AuthSubmitButton, PasswordField, useAuthForm } from '@/components/auth/formHelpers'
import { useAuth } from '@/lib/auth/AuthContext'
import { resetPassword } from '@/lib/auth/api'
import { readableError } from '@/lib/auth/readableError'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [done, setDone] = useState(false)
  const { error, submitting, runSubmit } = useAuthForm()

  if (!token) {
    return (
      <AuthLayout
        title="Enlace incompleto"
        description="Abre el enlace que te enviamos por correo, o pide uno nuevo."
      >
        <div className="rounded-[28px] bg-app-card p-5">
          <Link
            to="/forgot-password"
            className="block rounded-2xl bg-app-accent py-3 text-center text-sm font-medium text-white"
          >
            Pedir un enlace nuevo
          </Link>
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout
        title="Contraseña actualizada"
        description="Ya puedes entrar con la contraseña nueva."
      >
        <div className="rounded-[28px] bg-app-card p-5">
          <button
            type="button"
            className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
            onClick={() => navigate('/login', { replace: true })}
          >
            Ir a iniciar sesión
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      description="Elige una contraseña de al menos 8 caracteres. Este enlace solo se puede usar una vez."
    >
      <div className="space-y-4 rounded-[28px] bg-app-card p-5">
        <form
          className="space-y-4"
          onSubmit={(event) =>
            void runSubmit(
              event,
              async () => {
                if (password !== confirmPassword) {
                  throw new Error('Las contraseñas no coinciden')
                }
                await resetPassword({ token, password })
                try {
                  await logout()
                } catch {
                  // El reset ya cerró la sesión en el servidor.
                }
                setDone(true)
              },
              readableError,
            )
          }
        >
          <PasswordField
            label="Nueva contraseña"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
          <PasswordField
            label="Confirmar contraseña"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
          <AuthSubmitButton
            submitting={submitting}
            idleLabel="Guardar contraseña"
            busyLabel="Guardando…"
          />
        </form>
        {error ? <ErrorModal message={error} /> : null}
      </div>
      <p className="mt-6 text-center text-sm text-app-muted">
        <Link to="/forgot-password" className="font-medium text-app-accent">
          Pedir otro enlace
        </Link>
      </p>
    </AuthLayout>
  )
}
