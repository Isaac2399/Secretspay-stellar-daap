import { useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { fieldClass } from '@/components/auth/AuthLayout'

export function RoleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium ${
        active
          ? 'bg-app-accent text-white'
          : 'bg-app-chip text-white/80'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export function AuthSubmitButton({
  submitting,
  idleLabel,
  busyLabel,
}: {
  submitting: boolean
  idleLabel: string
  busyLabel: string
}) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white disabled:opacity-60"
    >
      {submitting ? busyLabel : idleLabel}
    </button>
  )
}

export function PasswordField({
  label,
  name,
  autoComplete,
  value,
  onChange,
}: {
  label: string
  name: string
  autoComplete: 'new-password' | 'current-password'
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="grid gap-1.5 text-sm font-medium text-white/80">
      <label htmlFor={name}>{label}</label>
      <div className="relative">
        <input
          id={name}
          className={`${fieldClass} pr-11`}
          type={visible ? 'text' : 'password'}
          name={name}
          autoComplete={autoComplete}
          minLength={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/55"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-app-line" />
      <span className="text-xs uppercase tracking-wide text-app-muted">{label}</span>
      <span className="h-px flex-1 bg-app-line" />
    </div>
  )
}

export function useAuthForm() {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function runAction(
    action: () => Promise<void>,
    onError: (err: unknown) => string,
  ) {
    setSubmitting(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(onError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function runSubmit(
    event: FormEvent<HTMLFormElement>,
    action: () => Promise<void>,
    onError: (err: unknown) => string,
  ) {
    event.preventDefault()
    await runAction(action, onError)
  }

  return { error, submitting, runSubmit, runAction }
}
