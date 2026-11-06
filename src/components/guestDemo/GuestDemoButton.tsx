import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { readableError } from '@/lib/auth/readableError'
import { useAuth } from '@/lib/auth/AuthContext'

export function GuestDemoButton({ merchantReady }: { merchantReady: boolean }) {
  const { startGuestDemo } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'customer' | 'merchant' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onClick(role: 'customer' | 'merchant') {
    setBusy(role)
    setError(null)
    try {
      await startGuestDemo(role)
      navigate('/event', { replace: true })
    } catch (err) {
      setError(readableError(err))
      setBusy(null)
    }
  }

  return (
    <div className="mb-6 space-y-3">
      <button
        type="button"
        onClick={() => void onClick('customer')}
        disabled={busy !== null}
        className="w-full rounded-2xl bg-app-accent px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/30 disabled:opacity-60"
      >
        {busy === 'customer' ? 'Entrando…' : 'Entrar como cliente'}
      </button>
      <button
        type="button"
        onClick={() => void onClick('merchant')}
        disabled={busy !== null || !merchantReady}
        className="w-full rounded-2xl bg-app-card px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy === 'merchant' ? 'Entrando…' : 'Entrar como empresa'}
      </button>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}
