import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Minus, Plus } from 'lucide-react'
import { readableError } from '@/lib/auth/readableError'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import {
  fetchEventCatalog,
  fetchMyEventOrders,
  placeEventOrder,
} from '@/lib/events/api'
import { enableOrderReadyPush, notifyOrderReadyLocally } from '@/lib/events/push'
import { formatStockLabel, stockCountClass } from '@/lib/events/stock'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { EventOrder, EventProduct, EventVenue } from '@/types/event'
import { CustomerOrderTicket } from './CustomerOrderTicket'

export function CustomerEventMenu({
  merchantId,
  onBack,
}: {
  merchantId: string
  onBack?: () => void
}) {
  const [venue, setVenue] = useState<EventVenue | null>(null)
  const [products, setProducts] = useState<EventProduct[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [orders, setOrders] = useState<EventOrder[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [placed, setPlaced] = useState<EventOrder | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [readyAlert, setReadyAlert] = useState<EventOrder | null>(null)
  const statusByIdRef = useRef<Record<string, EventOrder['status']>>({})
  const pushArmedRef = useRef(false)

  function applyOrders(nextOrders: EventOrder[]) {
    const prev = statusByIdRef.current
    let justReady: EventOrder | null = null
    for (const order of nextOrders) {
      const before = prev[order.id]
      if (order.status === 'ready' && before && before !== 'ready') {
        notifyOrderReadyLocally(order)
        justReady = order
      }
      prev[order.id] = order.status
    }
    setOrders(nextOrders)
    setPlaced((current) => {
      if (!current) {
        return current
      }
      return nextOrders.find((order) => order.id === current.id) ?? current
    })
    if (justReady) {
      setReadyAlert(justReady)
    }
  }

  async function ensurePush() {
    if (pushArmedRef.current) {
      return
    }
    pushArmedRef.current = true
    try {
      await enableOrderReadyPush()
    } catch {
      pushArmedRef.current = false
    }
  }

  async function reload() {
    const [catalog, mine] = await Promise.all([
      fetchEventCatalog(merchantId),
      fetchMyEventOrders(),
    ])
    setVenue(catalog.venue)
    setProducts(catalog.products)
    applyOrders(mine.orders.filter((order) => order.merchantId === merchantId))
  }

  useEffect(() => {
    let cancelled = false

    async function load(full: boolean) {
      try {
        if (full) {
          await reload()
          return
        }
        const [catalog, mine] = await Promise.all([
          fetchEventCatalog(merchantId),
          fetchMyEventOrders(),
        ])
        if (cancelled) {
          return
        }
        setVenue(catalog.venue)
        setProducts(catalog.products)
        applyOrders(mine.orders.filter((order) => order.merchantId === merchantId))
        setCart((prev) => {
          const next = { ...prev }
          for (const [id, qty] of Object.entries(next)) {
            const product = catalog.products.find((row) => row.id === id)
            if (!product || product.stock <= 0) {
              delete next[id]
            } else if (qty > product.stock) {
              next[id] = product.stock
            }
          }
          return next
        })
      } catch (err) {
        if (!cancelled && full) {
          setError(readableError(err))
        }
      }
    }

    void load(true)
    const id = window.setInterval(() => void load(false), 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [merchantId])

  useEffect(() => {
    const hasOpen = orders.some(
      (order) => order.status === 'preparing' || order.status === 'ready',
    )
    if (hasOpen) {
      void ensurePush()
    }
  }, [orders])

  const lines = useMemo(
    () =>
      products
        .map((product) => ({ product, qty: cart[product.id] ?? 0 }))
        .filter((line) => line.qty > 0),
    [cart, products],
  )

  async function checkout() {
    if (lines.length === 0) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await placeEventOrder({
        merchantId,
        items: lines.map((line) => ({
          productId: line.product.id,
          qty: line.qty,
        })),
      })
      setPlaced(result.order)
      statusByIdRef.current[result.order.id] = result.order.status
      setConfirmed(true)
      setCart({})
      void ensurePush()
      void reload().catch(() => undefined)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const pendingOrders = orders.filter(
    (order) => order.status === 'preparing' || order.status === 'ready',
  )
  const paidOrders = orders.filter((order) => order.status === 'completed')
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled')

  return (
    <div className="space-y-5">
      <div>
        {onBack ? (
          <button
            type="button"
            className="rounded-2xl bg-app-chip px-5 py-3 text-base font-medium text-app-accent disabled:opacity-40"
            disabled={busy}
            onClick={onBack}
          >
            ← Barras
          </button>
        ) : null}
        <h1 className="mt-3 text-2xl font-semibold">{venue?.title ?? 'Evento'}</h1>
        <p className="mt-1 text-base text-app-muted">
          Suma lo que quieres, paga y retira en {venue?.pickupLabel ?? 'la barra'}{' '}
          con tu número y QR.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Productos</h2>
        {products.length === 0 ? (
          <p className="text-sm text-app-muted">Aún no hay carta en esta barra.</p>
        ) : (
          products.map((product) => {
            const qty = cart[product.id] ?? 0
            const soldOut = product.stock <= 0
            return (
              <article key={product.id} className="rounded-[28px] bg-app-card p-5">
                <h3 className="text-xl font-semibold">{product.name}</h3>
                <p className="mt-1 text-lg text-white/90">
                  {formatAmount(product.price)} {product.asset}
                </p>
                {product.promo ? (
                  <p className="mt-1 text-sm text-app-accent">{product.promo.label}</p>
                ) : null}
                <p className={`mt-1 text-sm ${stockCountClass(product.stock)}`}>
                  {formatStockLabel(product.stock)}
                  <span className="text-app-muted"> · {product.pickupLabel}</span>
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={`Quitar ${product.name}`}
                    className="grid h-16 w-16 place-items-center rounded-full bg-app-chip disabled:opacity-40"
                    disabled={busy || qty <= 0}
                    onClick={() =>
                      setCart((prev) => ({
                        ...prev,
                        [product.id]: Math.max(0, (prev[product.id] ?? 0) - 1),
                      }))
                    }
                  >
                    <Minus className="h-7 w-7" />
                  </button>
                  <span className="min-w-10 text-center text-3xl font-semibold tabular-nums">
                    {qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Agregar ${product.name}`}
                    className="grid h-16 w-16 place-items-center rounded-full bg-app-accent disabled:opacity-40"
                    disabled={busy || soldOut || qty >= product.stock}
                    onClick={() =>
                      setCart((prev) => ({
                        ...prev,
                        [product.id]: Math.min(product.stock, (prev[product.id] ?? 0) + 1),
                      }))
                    }
                  >
                    <Plus className="h-7 w-7" />
                  </button>
                </div>
              </article>
            )
          })
        )}
      </section>

      {lines.length > 0 ? (
        <button
          type="button"
          className="sticky bottom-24 z-20 w-full rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] disabled:opacity-60"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void checkout()}
        >
          {busy ? (
            <span className="inline-flex items-center justify-center gap-2">
              <LoaderCircle className="h-6 w-6 animate-spin" />
              Pagando…
            </span>
          ) : (
            `Pagar y ordenar (${lines.length})`
          )}
        </button>
      ) : null}

      {pendingOrders.length > 0 || placed?.status === 'preparing' || placed?.status === 'ready' ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pedidos</h2>
          {placed && (placed.status === 'preparing' || placed.status === 'ready') ? (
            <CustomerOrderTicket order={placed} />
          ) : null}
          {pendingOrders
            .filter((order) => order.id !== placed?.id)
            .map((order) => (
              <CustomerOrderTicket key={order.id} order={order} />
            ))}
        </section>
      ) : null}

      {paidOrders.length > 0 || placed?.status === 'completed' ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Recogidos</h2>
          {placed?.status === 'completed' ? (
            <CustomerOrderTicket order={placed} compact />
          ) : null}
          {paidOrders
            .filter((order) => order.id !== placed?.id)
            .map((order) => (
              <CustomerOrderTicket key={order.id} order={order} compact />
            ))}
        </section>
      ) : null}

      {cancelledOrders.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-app-muted">Cancelados</h2>
          {cancelledOrders.map((order) => (
            <CustomerOrderTicket key={order.id} order={order} compact />
          ))}
        </section>
      ) : null}

      <ErrorModal message={error} onClose={() => setError(null)} />
      {busy ? <PaymentPendingNotice /> : null}
      {confirmed ? (
        <OrderConfirmedNotice onClose={() => setConfirmed(false)} />
      ) : null}
      {readyAlert ? (
        <OrderReadyNotice order={readyAlert} onClose={() => setReadyAlert(null)} />
      ) : null}
    </div>
  )
}

function PaymentPendingNotice() {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="payment-pending-title"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-[28px] border border-app-accent/40 bg-app-card p-6 text-center shadow-[0_0_40px_rgba(255,255,255,0.08)]">
        <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-app-accent" />
        <h2 id="payment-pending-title" className="mt-4 text-lg font-semibold">
          Procesando el pago
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          Estamos confirmando la transacción. No cierres esta pantalla.
        </p>
      </div>
    </div>
  )
}

function OrderReadyNotice({
  order,
  onClose,
}: {
  order: EventOrder
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="order-ready-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-app-accent/50 bg-app-card p-6 shadow-[0_0_40px_rgba(255,255,255,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-center text-xs font-medium uppercase tracking-wide text-app-accent">
          Pedido listo
        </p>
        <h2 id="order-ready-title" className="mt-2 text-center text-3xl font-semibold">
          #{order.orderNumber}
        </h2>
        <p className="mt-3 text-center text-[15px] leading-relaxed">
          Ya puedes retirarlo en {order.pickupLabel}. Muestra el QR en la barra.
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white"
          onClick={onClose}
        >
          Ver pedido
        </button>
      </div>
    </div>
  )
}

function OrderConfirmedNotice({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="order-confirmed-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-app-accent/40 bg-app-card p-6 shadow-[0_0_40px_rgba(255,255,255,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="order-confirmed-title"
          className="text-center text-[15px] font-medium leading-relaxed"
        >
          Pedido confirmado, ve a la barra y muestra el código QR para retirar el
          producto
        </h2>
        <button
          type="button"
          className="mt-6 w-full rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white"
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
