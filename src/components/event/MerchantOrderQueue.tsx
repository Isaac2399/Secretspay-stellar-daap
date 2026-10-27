import { useCallback, useEffect, useRef, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { SuccessModal } from '@/components/feedback/SuccessModal'
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

const ALREADY_DELIVERED_RE =
  /ya (se |fue )?entreg/i

export function MerchantOrderQueue({
  merchantId,
  asAdmin = false,
}: {
  merchantId?: string
  asAdmin?: boolean
} = {}) {
  const [orders, setOrders] = useState<EventOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [delivered, setDelivered] = useState<EventOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const [scannerReset, setScannerReset] = useState(0)
  const completingRef = useRef(false)

  const reload = useCallback(async () => {
    const result = await fetchMerchantOrders(asAdmin ? merchantId : undefined)
    setOrders(result.orders)
  }, [asAdmin, merchantId])

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
    if (!qr.trim() || completingRef.current) {
      return
    }
    completingRef.current = true
    setBusy(true)
    setError(null)
    setDelivered(null)
    try {
      const result = await completeEventOrderByQr(
        qr.trim(),
        asAdmin ? merchantId : undefined,
      )
      setDelivered(result.order)
      await reload()
    } catch (err) {
      const message = readableError(err)
      // Re-scan / screenshot of an already used QR → warn; do not confuse with success.
      setError(
        ALREADY_DELIVERED_RE.test(message)
          ? 'Ese pedido ya fue entregado. No vuelvas a dar productos.'
          : message,
      )
    } finally {
      completingRef.current = false
      setBusy(false)
      setScannerReset((n) => n + 1)
    }
  }

  const open = orders.filter((order) => order.status !== 'completed')
  const done = orders.filter((order) => order.status === 'completed').slice(0, 8)
  const deliveredItems = delivered
    ? delivered.items.map((item) => `${item.qty}× ${item.name}`).join(', ')
    : null

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
        <EventQrScanner
          busy={busy}
          resetKey={scannerReset}
          onScan={(value) => complete(value)}
        />
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
                void markEventOrderReady(order.id, asAdmin ? merchantId : undefined)
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

      {delivered ? (
        <SuccessModal
          title="Pedido entregado"
          message={`Pedido #${delivered.orderNumber} confirmado como entregado`}
          detail={deliveredItems}
          onClose={() => setDelivered(null)}
        />
      ) : null}
      {!delivered && error ? (
        <ErrorModal
          title={ALREADY_DELIVERED_RE.test(error) ? 'Pedido ya entregado' : 'No se puede entregar'}
          message={error}
          onClose={() => setError(null)}
        />
      ) : null}
    </div>
  )
}
