import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { readableError } from '@/lib/auth/readableError'
import { useAuth } from '@/lib/auth/AuthContext'

export function GuestDemoBanner() {
  const { resetGuestDemo } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onReset() {
    setBusy(true)
    setError(null)
    try {
      await resetGuestDemo()
      navigate('/login', { replace: true })
    } catch (err) {
      setError(readableError(err))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] lg:left-60">
        <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-amber-200/40 bg-amber-400 px-4 py-2 text-black shadow-lg shadow-black/40">
          <p className="min-w-0 text-xs font-semibold leading-tight">
            Modo Demo Activo - Fondos de Testnet
          </p>
          <button
            type="button"
            onClick={() => void onReset()}
            disabled={busy}
            className="shrink-0 rounded-full bg-black/90 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saliendo…' : 'Resetear'}
          </button>
        </div>
      </div>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </>
  )
}
