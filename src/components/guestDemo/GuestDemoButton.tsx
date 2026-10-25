import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fetchGuestDemoStatus } from '@/lib/auth/api'
import { readableError } from '@/lib/auth/readableError'
import { useAuth } from '@/lib/auth/AuthContext'

export function GuestDemoButton() {
  const { startGuestDemo } = useAuth()
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer = 0

    async function poll() {
      try {
        const status = await fetchGuestDemoStatus()
        if (cancelled) {
          return
        }
        setReady(status.ready)
        setAvailable(status.available)
        if (!status.available) {
          return
        }
        if (!status.ready) {
          timer = window.setTimeout(() => {
            void poll()
          }, 1200)
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void poll()
          }, 2000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      await startGuestDemo()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy || !available}
        className="w-full rounded-2xl bg-app-accent px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/30 disabled:opacity-60"
      >
        {busy
          ? 'Abriendo demo…'
          : '🚀 Probar Demo Instantánea (Jueces / Guest)'}
      </button>
      <p className="text-center text-xs leading-relaxed text-app-muted">
        {!available
          ? 'La demo de jueces solo está disponible en Testnet.'
          : ready
            ? 'Cuenta de Testnet lista, con fondos de prueba. Sin registro ni wallet personal.'
            : 'Preparando una cuenta de Testnet con USDC y ROJOS de prueba…'}
      </p>
      <div className="flex items-center gap-3 text-xs text-app-muted">
        <span className="h-px flex-1 bg-white/10" />
        o entra con tu cuenta
        <span className="h-px flex-1 bg-white/10" />
      </div>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}
