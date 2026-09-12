import { useEffect, useState } from 'react'
import { fetchMySinpe, retryMySinpe, type UnassignedDeposit } from '@/lib/sinpe/api'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { readableError } from '@/lib/auth/readableError'

export function MySinpeCredits() {
  const [deposits, setDeposits] = useState<UnassignedDeposit[]>([])
  const [credits, setCredits] = useState<
    Array<{ referenceId: string; calculatedRojos: number; status: string }>
  >([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    const result = await fetchMySinpe()
    setDeposits(result.deposits)
    setCredits(result.transactions)
  }

  useEffect(() => {
    let cancelled = false
    void fetchMySinpe()
      .then((result) => {
        if (cancelled) {
          return
        }
        setDeposits(result.deposits)
        setCredits(result.transactions)
      })
      .catch(() => {
        if (!cancelled) {
          setDeposits([])
          setCredits([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const pending = deposits.some((row) => row.status === 'PENDING_MANUAL_MATCH')

  if (deposits.length === 0 && credits.length === 0) {
    return null
  }

  return (
    <section className="rounded-[24px] bg-app-card p-4">
      <h2 className="text-[17px] font-semibold">Recargas SINPE</h2>
      <ul className="mt-3 space-y-2">
        {credits.map((row) => (
          <li key={`tx-${row.referenceId}`} className="text-sm">
            <span className="font-semibold tabular-nums">
              {formatAmount(String(row.calculatedRojos))} ROJOS
            </span>
            <span className="ml-2 text-xs text-app-muted">{row.status}</span>
          </li>
        ))}
        {deposits.map((row) => (
          <li key={row.id} className="text-sm">
            <span className="font-semibold tabular-nums">
              {formatAmount(String(row.calculatedRojos))} ROJOS
            </span>
            <span className="ml-2 text-xs text-app-muted">
              {row.stellarHash ? 'en Stellar' : 'detectada · pendiente de red'}
            </span>
            {row.lastError ? (
              <p className="mt-1 text-xs text-red-400">{row.lastError}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {pending ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            setBusy(true)
            setNotice(null)
            void retryMySinpe()
              .then(async (result) => {
                const failed = result.results.find((row) => !row.ok)
                setNotice(
                  failed?.error ??
                    (result.results.some((row) => row.ok)
                      ? 'Recarga acreditada en Stellar'
                      : 'No había recargas para reintentar'),
                )
                await reload()
              })
              .catch((err) => setNotice(readableError(err)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Reintentando…' : 'Reintentar acreditación'}
        </button>
      ) : null}
      {notice ? <p className="mt-2 text-xs text-app-muted">{notice}</p> : null}
    </section>
  )
}
