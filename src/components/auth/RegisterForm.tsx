import { useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Store, User } from 'lucide-react'
import { AuthField, fieldClass } from '@/components/auth/AuthLayout'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import {
  AuthDivider,
  AuthSubmitButton,
  PasswordField,
  RoleButton,
  useAuthForm,
} from '@/components/auth/formHelpers'
import type { UserRole } from '@/types/user'

type RegisterFormProps = {
  onSubmit: (input: {
    email: string
    password: string
    role: UserRole
  }) => Promise<void>
  onGoogle: (input: { accessToken: string; role: UserRole }) => Promise<void>
  formatError: (err: unknown) => string
}

export function RegisterForm({ onSubmit, onGoogle, formatError }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<UserRole>('customer')
  const { error, submitting, runSubmit, runAction } = useAuthForm()

  return (
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
              await onSubmit({ email, password, role })
            },
            formatError,
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
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthField>

        <PasswordField
          label="Contraseña"
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

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-white/80">Rol</legend>
          <div className="grid grid-cols-2 gap-2">
            <RoleButton
              active={role === 'customer'}
              onClick={() => setRole('customer')}
              icon={<User className="w-4 h-4" />}
              label="Cliente"
            />
            <RoleButton
              active={role === 'merchant'}
              onClick={() => setRole('merchant')}
              icon={<Store className="w-4 h-4" />}
              label="Empresa"
            />
          </div>
        </fieldset>

        <AuthSubmitButton
          submitting={submitting}
          idleLabel="Crear cuenta"
          busyLabel="Creando cuenta en Stellar…"
        />
      </form>

      <AuthDivider label="o" />

      <p className="text-center text-xs text-app-muted">
        Con Google se usa el rol seleccionado arriba (Cliente o Empresa).
      </p>

      <GoogleSignInButton
        label="Registrarse con Google"
        disabled={submitting}
        onToken={(accessToken) =>
          runAction(() => onGoogle({ accessToken, role }), formatError)
        }
      />

      {error ? <ErrorModal message={error} /> : null}
    </div>
  )
}
