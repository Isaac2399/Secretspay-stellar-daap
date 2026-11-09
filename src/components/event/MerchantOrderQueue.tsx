import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { SuccessModal } from '@/components/feedback/SuccessModal'
import { readableError } from '@/lib/auth/readableError'
import {
  completeEventOrderByQr,
  fetchMerchantOrders,
  markEventOrderReady,
  markEventProductUnavailable,
} from '@/lib/events/api'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { EventOrder } from '@/types/event'
import { EventQrScanner } from './EventQrScanner'

const STATUS_LABEL: Record<EventOrder['status'], string> = {
  preparing: 'Pendiente',
  ready: 'Listo',
  awaiting_choice: 'Esperando al cliente',
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
  const [errorTitle, setErrorTitle] = useState('No se puede entregar')
  const [delivered, setDelivered] = useState<EventOrder | null>(null)
  const [scanning, setScanning] = useState(false)
  const [pendingLines, setPendingLines] = useState<Record<string, true>>({})
  const [readyIds, setReadyIds] = useState<Record<string, true>>({})
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
    setScanning(true)
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
      setErrorTitle(ALREADY_DELIVERED_RE.test(message) ? 'Pedido ya entregado' : 'No se puede entregar')
      setError(
        ALREADY_DELIVERED_RE.test(message)
          ? 'Ese pedido ya fue entregado. No vuelvas a dar productos.'
          : message,
      )
    } finally {
      completingRef.current = false
      setScanning(false)
      setScannerReset((n) => n + 1)
    }
  }

  async function markMissing(orderId: string, productId: string) {
    const key = `${orderId}:${productId}`
    if (pendingLines[key]) {
      return
    }
    setPendingLines((current) => ({ ...current, [key]: true }))
    setError(null)
    try {
      await markEventProductUnavailable(orderId, productId, asAdmin ? merchantId : undefined)
      await reload()
    } catch (err) {
      setErrorTitle('No se pudo avisar')
      setError(readableError(err))
    } finally {
      setPendingLines((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    }
  }

  async function markReady(orderId: string) {
    if (readyIds[orderId]) {
      return
    }
    setReadyIds((current) => ({ ...current, [orderId]: true }))
    setError(null)
    try {
      await markEventOrderReady(orderId, asAdmin ? merchantId : undefined)
      await reload()
    } catch (err) {
      setErrorTitle('No se pudo marcar')
      setError(readableError(err))
    } finally {
      setReadyIds((current) => {
        const next = { ...current }
        delete next[orderId]
        return next
      })
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
          Marca listo para la pantalla y lee el QR del cliente al entregar. Si en
          la barra ya no queda un producto, márcalo: el cliente lo cambia o pide
          el reembolso.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="rounded-[24px] bg-app-card p-4 lg:sticky lg:top-6">
          <h3 className="mb-3 text-sm font-semibold">Leer QR de retiro</h3>
          <EventQrScanner
            busy={scanning}
            resetKey={scannerReset}
            onScan={(value) => complete(value)}
          />
          {scanning ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-app-muted">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Confirmando la entrega. Los otros pedidos siguen disponibles.
            </p>
          ) : null}
        </section>

        <div className="space-y-5">
          {open.map((order) => {
            const waitingOnCustomer = order.items.some((item) => item.unavailable)
            const tellingCustomer = order.items.some(
              (item) => pendingLines[`${order.id}:${item.productId}`],
            )
            return (
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
              {tellingCustomer ? (
                <p className="flex items-center gap-2 text-xs text-app-muted">
                  <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  Avisando al cliente. Puedes escanear y entregar los otros pedidos.
                </p>
              ) : null}
              <ul className="space-y-2 text-sm text-white/80">
                {order.items.map((item) => {
                  const lineKey = `${order.id}:${item.productId}`
                  const lineBusy = Boolean(pendingLines[lineKey])
                  return (
                  <li key={lineKey} className="flex items-center justify-between gap-3">
                    <span>
                      {item.qty}× {item.name}
                      {item.unavailable ? (
                        <span className="text-app-accent"> · sin stock</span>
                      ) : null}
                    </span>
                    {lineBusy ? (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-app-muted">
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Avisando…
                      </span>
                    ) : order.status !== 'completed' && order.status !== 'cancelled' && !item.unavailable ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-xl bg-app-chip px-3 py-1.5 text-xs font-medium"
                        onClick={() => void markMissing(order.id, item.productId)}
                      >
                        No hay
                      </button>
                    ) : null}
                  </li>
                  )
                })}
              </ul>
              {order.status === 'preparing' ? (
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
                  disabled={Boolean(readyIds[order.id]) || tellingCustomer}
                  onClick={() => void markReady(order.id)}
                >
                  {readyIds[order.id] ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Marcando…
                    </>
                  ) : (
                    'Marcar listo'
                  )}
                </button>
              ) : order.status === 'awaiting_choice' ? (
                <p className="text-xs text-app-muted">
                  {waitingOnCustomer
                    ? 'Este pedido espera al cliente en cada producto que falta. Los demás pedidos se escanean y se entregan igual.'
                    : 'El cliente tiene que cambiar el producto o pedir el reembolso.'}
                </p>
              ) : order.status === 'cancelled' ? (
                <p className="text-xs text-app-muted">Reembolsado. No entregues este pedido.</p>
              ) : (
                <p className="text-xs text-app-muted">Esperando QR en la barra</p>
              )}
            </article>
            )
          })}
        </div>
      </div>

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
          title={errorTitle}
          message={error}
          onClose={() => setError(null)}
        />
      ) : null}
    </div>
  )
}
