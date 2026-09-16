import { useState } from 'react'
import { lookupSinpeClaim, type SinpeLookup } from '@/lib/sinpe/api'
import { readableError } from '@/lib/auth/readableError'

export function ClaimLookupPanel() {
  const [referenceId, setReferenceId] = useState('')
  const [result, setResult] = useState<SinpeLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Búsqueda por reclamo</h2>
        <p className="mt-1 text-xs text-app-muted">
          Verifica un comprobante o cualquier parte del SMS guardado.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setLoading(true)
          setResult(null)
          void lookupSinpeClaim(referenceId)
            .then((next) => {
              setResult(next)
              setError(null)
            })
            .catch((err) => setError(readableError(err)))
            .finally(() => setLoading(false))
        }}
      >
        <input
          value={referenceId}
          onChange={(event) => setReferenceId(event.target.value)}
          placeholder="Comprobante o texto del SMS"
          className="min-w-0 flex-1 rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="rounded-2xl bg-app-accent px-3 py-2 text-sm font-medium"
        >
          Buscar
        </button>
      </form>
      {loading ? <p className="text-sm text-app-muted">Buscando…</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result?.transaction ? (
        <div className="rounded-[24px] bg-app-card p-4 text-sm">
          <p className="font-semibold">Transacción {result.transaction.status}</p>
          <p className="mt-1 text-app-muted">
            {result.transaction.calculatedRojos} ROJOS
          </p>
          {result.transaction.stellarHash ? (
            <p className="mt-1 break-all font-mono text-[11px] text-white/70">
              {result.transaction.stellarHash}
            </p>
          ) : null}
        </div>
      ) : null}
      {result?.deposit ? (
        <div className="rounded-[24px] bg-app-card p-4 text-sm">
          <p className="font-semibold">Depósito {result.deposit.status}</p>
          <p className="mt-1 text-app-muted">
            ₡{result.deposit.crcAmount.toLocaleString('es-CR')} →{' '}
            {result.deposit.calculatedRojos} ROJOS
          </p>
          <p className="mt-1 break-all text-xs">
            Nota: {result.deposit.comment || '—'}
          </p>
          {result.deposit.rawMessage ? (
            <p className="mt-2 max-h-28 overflow-y-auto break-all text-[11px] text-white/55">
              {result.deposit.rawMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
