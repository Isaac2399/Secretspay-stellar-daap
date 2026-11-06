import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { AuthField, AuthLayout, fieldClass } from '@/components/auth/AuthLayout'
import { AuthSubmitButton, useAuthForm } from '@/components/auth/formHelpers'
import { requestPasswordReset } from '@/lib/auth/api'
import { readableError } from '@/lib/auth/readableError'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<{
    message: string
    devResetUrl?: string
    devHint?: string
  } | null>(null)
  const { error, submitting, runSubmit } = useAuthForm()

  if (sent) {
    const localLink = Boolean(sent.devResetUrl)
    return (
      <AuthLayout
        title={localLink ? 'Enlace listo' : 'Revisa tu correo'}
        description={
          localLink
            ? 'En esta computadora el correo todavía no está configurado, así que el enlace aparece aquí.'
            : 'El enlace sirve una sola vez y vence en 30 minutos.'
        }
      >
        <div className="space-y-4 rounded-[28px] bg-app-card p-5">
          <p className="text-sm leading-relaxed text-white/85">
            {localLink
              ? 'Abre el enlace para elegir la contraseña nueva. Vence en 30 minutos y solo se puede usar una vez.'
              : sent.message}
          </p>
          {sent.devHint ? (
            <p className="text-sm leading-relaxed text-white/85">{sent.devHint}</p>
          ) : null}
          {sent.devResetUrl ? (
            <a
              href={sent.devResetUrl}
              className="block rounded-2xl bg-app-accent py-3 text-center text-sm font-medium text-white"
            >
              Abrir enlace de recuperación
            </a>
          ) : null}
          <Link
            to="/login"
            className="block text-center text-sm font-medium text-app-accent"
          >
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Olvidé mi contraseña"
      description="Escribe el email de tu cuenta. Si está registrado, te enviamos un enlace para elegir una contraseña nueva."
    >
      <div className="space-y-4 rounded-[28px] bg-app-card p-5">
        <form
          className="space-y-4"
          onSubmit={(event) =>
            void runSubmit(
              event,
              async () => {
                const result = await requestPasswordReset(email)
                setSent({
                  message: result.message,
                  devResetUrl: result.devResetUrl,
                  devHint: result.devHint,
                })
              },
              readableError,
            )
          }
        >
          <AuthField label="Email">
            <input
              className={fieldClass}
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </AuthField>
          <AuthSubmitButton
            submitting={submitting}
            idleLabel="Enviar enlace"
            busyLabel="Enviando…"
          />
        </form>
        {error ? <ErrorModal message={error} /> : null}
      </div>
      <p className="mt-6 text-center text-sm text-app-muted">
        <Link to="/login" className="font-medium text-app-accent">
          Volver a iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
