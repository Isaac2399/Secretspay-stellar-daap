import { useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { AuthField, fieldClass } from '@/components/auth/AuthLayout'
import { AuthSubmitButton, useAuthForm } from '@/components/auth/formHelpers'

type LoginFormProps = {
  onSubmit: (input: { email: string; password: string }) => Promise<void>
  formatError: (err: unknown) => string
}

export function LoginForm({ onSubmit, formatError }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, submitting, runSubmit } = useAuthForm()

  return (
    <div className="space-y-4 rounded-[28px] bg-app-card p-5">
      <form
        className="space-y-4"
        onSubmit={(event) =>
          void runSubmit(event, () => onSubmit({ email, password }), formatError)
        }
      >
        <AuthField label="Email">
          <input
            className={fieldClass}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>

        <AuthField label="Contraseña">
          <input
            className={fieldClass}
            type="password"
            name="password"
            autoComplete="current-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </AuthField>

        <AuthSubmitButton
          submitting={submitting}
          idleLabel="Entrar"
          busyLabel="Entrando…"
        />
      </form>

      {error ? <ErrorModal message={error} /> : null}
    </div>
  )
}
