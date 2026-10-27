import { useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { lookupSinpeClaim, type SinpeLookup } from '@/lib/sinpe/api'
import { readableError } from '@/lib/auth/readableError'
import { shortenPublicKey } from '@/lib/userDisplay'

export function ClaimLookupPanel() {
  const [referenceId, setReferenceId] = useState('')
  const [result, setResult] = useState<SinpeLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Confirmar por número de referencia</h2>
        <p className="mt-1 text-xs text-app-muted">
          Verifica un comprobante: si ya se otorgó a mano, aquí queda confirmado
          y no debe acreditarse otra vez.
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
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
      {result ? (
        <div className="space-y-2">
          {result.suggestedUser ? (
            <div className="rounded-[24px] border border-app-accent/40 bg-app-card p-4 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-app-accent">
                Sugerencia
                {result.matchedCode ? ` · código ${result.matchedCode}` : ''}
              </p>
              <p className="mt-1 font-semibold">{result.suggestedUser.email}</p>
              <p className="mt-0.5 font-mono text-[11px] text-white/70">
                {shortenPublicKey(result.suggestedUser.publicKey)}
              </p>
              <p className="mt-2 text-xs text-app-muted">
                {suggestionCopy(result)}
              </p>
            </div>
          ) : null}
          {result.alreadyFulfilled ? (
            <div className="rounded-[24px] bg-app-card p-4 text-sm">
              <p className="font-semibold text-app-accent">
                {result.manualGrant
                  ? 'Ya se dio manualmente'
                  : 'Ya está acreditado'}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                Este número de referencia confirma que no se debe entregar de
                nuevo automáticamente.
              </p>
            </div>
          ) : null}
          {result.transaction ? (
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
          {result.deposit ? (
            <div className="rounded-[24px] bg-app-card p-4 text-sm">
              <p className="font-semibold">
                Depósito {depositStatusLabel(result.deposit.status)}
              </p>
              <p className="mt-1 font-mono text-[11px] text-white/70">
                Comprobante {result.deposit.referenceId}
              </p>
              <p className="mt-1 text-app-muted">
                ₡{result.deposit.crcAmount.toLocaleString('es-CR')} →{' '}
                {result.deposit.calculatedRojos} ROJOS
              </p>
              <p className="mt-1 break-all text-xs">
                Nota: {result.deposit.comment || '—'}
              </p>
              {result.deposit.resolvedByAdminId ? (
                <p className="mt-2 text-xs text-app-accent">
                  Otorgado por admin · {result.deposit.resolvedAt
                    ? new Date(result.deposit.resolvedAt).toLocaleString()
                    : 'sin fecha'}
                </p>
              ) : null}
              {result.deposit.rawMessage ? (
                <p className="mt-2 max-h-28 overflow-y-auto break-all text-[11px] text-white/55">
                  {result.deposit.rawMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function depositStatusLabel(status: string) {
  if (status === 'PENDING_USER_CLAIM') return 'reclamo pendiente'
  if (status === 'RESOLVED') return 'otorgado manualmente'
  if (status === 'RESOLVED_BY_USER_CLAIM') return 'reclamado por cliente'
  return status
}

function suggestionCopy(result: SinpeLookup) {
  if (result.suggestionReason === 'code' && result.matchedCode) {
    return `Cuenta ligada al código ${result.matchedCode} de la nota SINPE.`
  }
  if (result.suggestionReason === 'transaction') {
    return 'Cuenta que ya figura en la transacción de este comprobante.'
  }
  return 'Cuenta ya asociada a este depósito o reclamo.'
}
