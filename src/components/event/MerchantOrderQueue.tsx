import { useCallback, useEffect, useState } from 'react'
import { readableError } from '@/lib/auth/readableError'
import {
  completeEventOrderByQr,
  fetchMerchantOrders,
  markEventOrderReady,
} from '@/lib/events/api'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { EventOrder } from '@/types/event'
import { EventQrScanner } from './EventQrScanner'

const STATUS_LABEL: Record<EventOrder['status'], string> = {
  preparing: 'Pendiente',
  ready: 'Listo',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

export function MerchantOrderQueue() {
  const [orders, setOrders] = useState<EventOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const result = await fetchMerchantOrders()
    setOrders(result.orders)
  }, [])

  useEffect(() => {
    let cancelled = false
    void reload().catch((err) => {
      if (!cancelled) {
        setError(readableError(err))
      }
    })
    const id = window.setInterval(() => {
      void reload().catch(() => undefined)
    }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [reload])

  async function complete(qr: string) {
    if (!qr.trim()) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await completeEventOrderByQr(qr.trim())
      setMessage(`Pedido #${result.order.orderNumber} entregado`)
      await reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const open = orders.filter((order) => order.status !== 'completed')
  const done = orders.filter((order) => order.status === 'completed').slice(0, 8)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Pedidos de barra</h2>
        <p className="mt-1 text-sm text-app-muted">
          Marca listo para la pantalla y lee el QR del cliente al entregar.
        </p>
      </div>

      <section className="rounded-[24px] bg-app-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Leer QR de retiro</h3>
        <EventQrScanner busy={busy} onScan={(value) => void complete(value)} />
      </section>

      {open.map((order) => (
        <article key={order.id} className="space-y-2 rounded-[24px] bg-app-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-semibold">#{order.orderNumber}</p>
              <p className="text-xs text-app-accent">{STATUS_LABEL[order.status]}</p>
            </div>
            <p className="text-sm">
              {formatAmount(order.total)} {order.asset}
            </p>
          </div>
          <ul className="text-sm text-white/80">
            {order.items.map((item) => (
              <li key={`${order.id}-${item.productId}`}>
                {item.qty}× {item.name}
              </li>
            ))}
          </ul>
          {order.status === 'preparing' ? (
            <button
              type="button"
              className="w-full rounded-xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
              disabled={busy}
              onClick={() =>
                void markEventOrderReady(order.id)
                  .then(() => reload())
                  .catch((err) => setError(readableError(err)))
              }
            >
              Marcar listo
            </button>
          ) : (
            <p className="text-xs text-app-muted">Esperando QR en la barra</p>
          )}
        </article>
      ))}

      {done.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-app-muted">Entregados</h3>
          {done.map((order) => (
            <p key={order.id} className="text-sm text-white/70">
              #{order.orderNumber} · {STATUS_LABEL[order.status]}
            </p>
          ))}
        </section>
      ) : null}

      {message ? <p className="text-sm text-app-accent">{message}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  )
}
