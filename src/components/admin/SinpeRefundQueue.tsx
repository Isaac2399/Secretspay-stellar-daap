import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fetchCashRefunds, markRefundPaid, type CashRefund } from '@/lib/cash/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

export function SinpeRefundQueue() {
  const [refunds, setRefunds] = useState<CashRefund[]>([])
  const [payingId, setPayingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pending = refunds.filter((row) => row.status === 'pending_cash')

  async function reload() {
    const result = await fetchCashRefunds()
    setRefunds(result.refunds)
  }

  useEffect(() => {
    let cancelled = false
    void reload().catch((err) => {
      if (!cancelled) {
        setError(readableError(err))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Reembolsos SINPE por enviar</h2>
      <p className="text-sm text-app-muted">
        El cliente ya devolvió los ROJOS. Envía el SINPE Móvil al teléfono que dejó
        y marca el reembolso.
      </p>
      {pending.length === 0 ? (
        <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
          No hay reembolsos pendientes.
        </p>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {pending.map((row) => (
          <li key={row.id} className="space-y-2 rounded-[24px] bg-app-card p-4">
            <p className="text-xs text-app-muted">
              {new Date(row.createdAt).toLocaleString()}
            </p>
            <p className="text-2xl font-semibold tabular-nums tracking-wide">
              {row.phoneDisplay ?? row.phone ?? 'Sin teléfono'}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              ₡{row.crcAmount.toLocaleString('es-CR')}
            </p>
            <p className="text-sm text-white/80">
              {formatAmount(row.rojos)} ROJOS · {row.email}
            </p>
            <button
              type="button"
              disabled={payingId === row.id}
              className="w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-40"
              onClick={() => {
                setPayingId(row.id)
                setError(null)
                void markRefundPaid(row.id)
                  .then(() => reload())
                  .catch((err) => setError(readableError(err)))
                  .finally(() => setPayingId(null))
              }}
            >
              {payingId === row.id ? 'Marcando…' : 'SINPE enviado'}
            </button>
          </li>
        ))}
      </ul>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </section>
  )
}
