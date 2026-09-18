import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { readableError } from '@/lib/auth/readableError'
import {
  fetchEventCatalog,
  fetchMyEventOrders,
  placeEventOrder,
} from '@/lib/events/api'
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

  async function reload() {
    const [catalog, mine] = await Promise.all([
      fetchEventCatalog(merchantId),
      fetchMyEventOrders(),
    ])
    setVenue(catalog.venue)
    setProducts(catalog.products)
    setOrders(mine.orders.filter((order) => order.merchantId === merchantId))
  }

  useEffect(() => {
    let cancelled = false

    async function load(full: boolean) {
      try {
        if (full) {
          await reload()
          return
        }
        const catalog = await fetchEventCatalog(merchantId)
        if (cancelled) {
          return
        }
        setVenue(catalog.venue)
        setProducts(catalog.products)
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
      setCart({})
      await reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const activeOrders = orders.filter((order) => order.status !== 'completed')

  return (
    <div className="space-y-5">
      <div>
        {onBack ? (
          <button type="button" className="text-sm text-app-accent" onClick={onBack}>
            ← Barras
          </button>
        ) : null}
        <h1 className="mt-1 text-xl font-semibold">{venue?.title ?? 'Evento'}</h1>
        <p className="mt-1 text-sm text-app-muted">
          Ordena, paga en la app y retira en {venue?.pickupLabel ?? 'la barra'} con
          tu número y QR.
        </p>
      </div>

      {placed ? <CustomerOrderTicket order={placed} /> : null}

      {activeOrders
        .filter((order) => order.id !== placed?.id)
        .map((order) => (
          <CustomerOrderTicket key={order.id} order={order} />
        ))}

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Productos</h2>
        {products.length === 0 ? (
          <p className="text-sm text-app-muted">Aún no hay carta en esta barra.</p>
        ) : (
          products.map((product) => {
            const qty = cart[product.id] ?? 0
            const soldOut = product.stock <= 0
            return (
              <article key={product.id} className="rounded-[24px] bg-app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{product.name}</h3>
                    <p className="mt-1 text-sm text-white/80">
                      {formatAmount(product.price)} {product.asset}
                    </p>
                    {product.promo ? (
                      <p className="mt-1 text-xs text-app-accent">{product.promo.label}</p>
                    ) : null}
                    <p className={`mt-1 text-xs ${stockCountClass(product.stock)}`}>
                      {formatStockLabel(product.stock)}
                      <span className="text-app-muted"> · {product.pickupLabel}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full bg-app-chip disabled:opacity-40"
                      disabled={qty <= 0}
                      onClick={() =>
                        setCart((prev) => ({
                          ...prev,
                          [product.id]: Math.max(0, (prev[product.id] ?? 0) - 1),
                        }))
                      }
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-4 text-center text-sm">{qty}</span>
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full bg-app-accent disabled:opacity-40"
                      disabled={soldOut || qty >= product.stock}
                      onClick={() =>
                        setCart((prev) => ({
                          ...prev,
                          [product.id]: Math.min(product.stock, (prev[product.id] ?? 0) + 1),
                        }))
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </section>

      {lines.length > 0 ? (
        <button
          type="button"
          className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white disabled:opacity-60"
          disabled={busy}
          onClick={() => void checkout()}
        >
          {busy ? 'Pagando…' : `Pagar y ordenar (${lines.length})`}
        </button>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  )
}
