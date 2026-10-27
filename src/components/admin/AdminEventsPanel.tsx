import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { MerchantEventCatalog } from '@/components/event/MerchantEventCatalog'
import { fetchAdminEvents } from '@/lib/events/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { EventAdminRow } from '@/types/event'

export function AdminEventsPanel() {
  const [events, setEvents] = useState<EventAdminRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function reload() {
    const result = await fetchAdminEvents()
    setEvents(result.events)
    return result.events
  }

  useEffect(() => {
    let cancelled = false
    void reload()
      .then((rows) => {
        if (!cancelled && rows.length > 0 && !selectedId) {
          setSelectedId(rows[0].merchantId)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = events.find((row) => row.merchantId === selectedId) ?? null

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Eventos</h2>
        <p className="text-xs text-app-muted">
          Elige una empresa para ver su carta, editar todos los campos, productos
          y activar o desactivar el evento.
        </p>
        {loading ? <p className="text-sm text-app-muted">Cargando eventos…</p> : null}
        {!loading && events.length === 0 ? (
          <p className="text-sm text-app-muted">Todavía no hay empresas registradas.</p>
        ) : null}
        <ul className="space-y-2">
          {events.map((row) => {
            const open = row.merchantId === selectedId
            return (
              <li key={row.merchantId}>
                <button
                  type="button"
                  className={`w-full rounded-2xl px-4 py-3 text-left ${
                    open ? 'bg-app-accent/20 ring-1 ring-app-accent' : 'bg-app-chip'
                  }`}
                  onClick={() =>
                    setSelectedId((current) =>
                      current === row.merchantId ? null : row.merchantId,
                    )
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{row.title}</h3>
                      <p className="text-xs text-app-muted">{row.email}</p>
                      <p className="mt-1 text-[11px] text-white/70">
                        {row.orderCount} pedidos
                        {Object.keys(row.feesCollected).length > 0
                          ? ` · cobrado ${Object.entries(row.feesCollected)
                              .map(
                                ([asset, amount]) =>
                                  `${formatAmount(amount)} ${asset}`,
                              )
                              .join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          row.active !== false ? 'text-app-accent' : 'text-app-muted'
                        }`}
                      >
                        {row.active !== false ? 'Activo' : 'Inactivo'}
                      </p>
                      <p className="text-xs text-app-muted">
                        {row.feeBps > 0 ? `${row.feePercent}%` : 'Sin comisión'}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {selected ? (
        <MerchantEventCatalog
          key={selected.merchantId}
          merchantId={selected.merchantId}
          asAdmin
          merchantEmail={selected.email}
          onSettingsSaved={() => {
            void reload().catch((err) => setError(readableError(err)))
          }}
        />
      ) : null}

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}
