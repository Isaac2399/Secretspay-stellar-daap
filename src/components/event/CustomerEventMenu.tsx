import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { LoaderCircle, Minus, Plus, X } from 'lucide-react'
import { AuthApiError } from '@/lib/auth/api'
import { readableError } from '@/lib/auth/readableError'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { SuccessModal } from '@/components/feedback/SuccessModal'
import {
  fetchEventCatalog,
  fetchMyEventOrders,
  placeEventOrder,
  resolveEventOrder,
} from '@/lib/events/api'
import {
  enableOrderReadyPush,
  notifyMissingProductLocally,
  notifyOrderPlacedLocally,
  notifyOrderReadyLocally,
} from '@/lib/events/push'
import { formatStockLabel, stockCountClass } from '@/lib/events/stock'
import { useAuth } from '@/lib/auth/AuthContext'
import { Networks } from '@stellar/stellar-sdk'
import { stellarConfig } from '@/lib/stellar/config'
import { formatAmount, useAccountBalances } from '@/lib/stellar/useAccountBalances'
import type { EventOrder, EventProduct, EventVenue } from '@/types/event'
import { CustomerOrderTicket } from './CustomerOrderTicket'

type StockAlternative = {
  id: string
  name: string
  price: string
  asset: string
  stock: number
}

type StockSwap = {
  productId: string
  name: string
  requested: number
  available: number
  alternatives: StockAlternative[]
}

function readStockSwap(error: unknown): StockSwap | null {
  if (!(error instanceof AuthApiError) || error.code !== 'out_of_stock') {
    return null
  }
  const details = error.details
  if (!details || typeof details !== 'object') {
    return null
  }
  const row = details as Partial<StockSwap>
  if (typeof row.productId !== 'string' || typeof row.name !== 'string') {
    return null
  }
  const alternatives = Array.isArray(row.alternatives)
    ? row.alternatives.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }
        const alt = item as Partial<StockAlternative>
        if (
          typeof alt.id !== 'string' ||
          typeof alt.name !== 'string' ||
          typeof alt.price !== 'string' ||
          typeof alt.asset !== 'string' ||
          typeof alt.stock !== 'number'
        ) {
          return []
        }
        return [alt as StockAlternative]
      })
    : []
  return {
    productId: row.productId,
    name: row.name,
    requested: typeof row.requested === 'number' ? row.requested : 1,
    available: typeof row.available === 'number' ? row.available : 0,
    alternatives,
  }
}

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
  const [receipt, setReceipt] = useState<{ order: EventOrder; hash: string } | null>(null)
  const [swap, setSwap] = useState<StockSwap | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [readyAlert, setReadyAlert] = useState<EventOrder | null>(null)
  const [stockAlert, setStockAlert] = useState<EventOrder | null>(null)
  const [panel, setPanel] = useState<'carta' | 'pedidos'>('carta')
  const statusByIdRef = useRef<Record<string, EventOrder['status']>>({})
  const pushArmedRef = useRef<Promise<void> | null>(null)
  const openedOrdersRef = useRef(false)
  const nudgedChoiceRef = useRef<Record<string, true>>({})
  const { user } = useAuth()
  const { balances, reload: reloadBalances } = useAccountBalances(user?.publicKey ?? '')

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
      setPanel('pedidos')
    }
  }

  function ensurePush(): Promise<void> {
    if (pushArmedRef.current) {
      return pushArmedRef.current
    }
    const pending = enableOrderReadyPush()
      .then(() => undefined)
      .catch(() => {
        pushArmedRef.current = null
      })
    pushArmedRef.current = pending
    return pending
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
          let missing: { id: string; name: string; requested: number; asset: string } | null =
            null
          for (const [id, qty] of Object.entries(next)) {
            const product = catalog.products.find((row) => row.id === id)
            if (!product || product.stock <= 0) {
              delete next[id]
              if (!missing) {
                missing = {
                  id,
                  name: product?.name ?? 'Ese producto',
                  requested: qty,
                  asset: product?.asset ?? '',
                }
              }
            } else if (qty > product.stock) {
              next[id] = product.stock
            }
          }
          if (missing) {
            const gone = missing
            setSwap({
              productId: gone.id,
              name: gone.name,
              requested: gone.requested,
              available: 0,
              alternatives: catalog.products
                .filter(
                  (row) =>
                    row.id !== gone.id &&
                    row.stock > 0 &&
                    (!gone.asset || row.asset === gone.asset),
                )
                .map((row) => ({
                  id: row.id,
                  name: row.name,
                  price: row.price,
                  asset: row.asset,
                  stock: row.stock,
                })),
            })
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
      (order) =>
        order.status === 'preparing' ||
        order.status === 'ready' ||
        order.status === 'awaiting_choice',
    )
    const choice = orders.find((order) => {
      if (order.status !== 'awaiting_choice') {
        return false
      }
      const key = `${order.id}:${order.items
        .filter((item) => item.unavailable)
        .map((item) => item.productId)
        .join(',')}`
      return !nudgedChoiceRef.current[key]
    })
    if (choice) {
      const key = `${choice.id}:${choice.items
        .filter((item) => item.unavailable)
        .map((item) => item.productId)
        .join(',')}`
      nudgedChoiceRef.current[key] = true
      setPanel('pedidos')
      setStockAlert(choice)
      setReceipt(null)
      const names = choice.items
        .filter((item) => item.unavailable)
        .map((item) => item.name)
        .join(', ')
      notifyMissingProductLocally({
        id: choice.id,
        orderNumber: choice.orderNumber,
        names: names || 'Un producto',
      })
    }
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
      setReceipt({ order: result.order, hash: result.hash || result.order.stellarHash || '' })
      setCart({})
      setPanel('pedidos')
      void ensurePush().then(() => notifyOrderPlacedLocally(result.order))
      void reload().catch(() => undefined)
      void reloadBalances()
    } catch (err) {
      const offer = readStockSwap(err)
      if (offer) {
        setSwap(offer)
      } else {
        setError(readableError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  async function resolveLine(
    orderId: string,
    productId: string,
    action: 'refund' | 'replace',
    replacementProductId?: string,
  ) {
    setBusy(true)
    setError(null)
    try {
      const result = await resolveEventOrder({
        orderId,
        productId,
        action,
        replacementProductId,
      })
      setNotice(result.message)
      statusByIdRef.current[result.order.id] = result.order.status
      setPlaced(result.order)
      void reload().catch(() => undefined)
      void reloadBalances()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  const pendingOrders = orders
    .filter(
      (order) =>
        order.status === 'preparing' ||
        order.status === 'ready' ||
        order.status === 'awaiting_choice',
    )
    .sort((a, b) => {
      if (a.status === b.status) {
        return b.createdAt.localeCompare(a.createdAt)
      }
      return a.status === 'ready' ? -1 : 1
    })
  const paidOrders = orders.filter((order) => order.status === 'completed')
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled')
  const readyCount = pendingOrders.filter((order) => order.status === 'ready').length

  useEffect(() => {
    if (openedOrdersRef.current || pendingOrders.length === 0) {
      return
    }
    openedOrdersRef.current = true
    setPanel('pedidos')
  }, [pendingOrders.length])

  function applySwap(alternative: StockAlternative) {
    if (!swap) {
      return
    }
    setCart((prev) => {
      const next = { ...prev }
      delete next[swap.productId]
      const qty = Math.min(swap.requested, alternative.stock)
      if (qty > 0) {
        next[alternative.id] = Math.min(
          alternative.stock,
          (next[alternative.id] ?? 0) + qty,
        )
      }
      return next
    })
    setSwap(null)
  }

  function keepAvailable() {
    if (!swap || swap.available <= 0) {
      return
    }
    setCart((prev) => ({ ...prev, [swap.productId]: swap.available }))
    setSwap(null)
  }

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
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-app-muted">
          Saldo
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatAmount(balances.loyalty)}
          </span>
          <span className="text-lg font-medium text-white/55">
            {stellarConfig.loyalty.code}
          </span>
        </p>
        <h1 className="mt-4 text-2xl font-semibold">{venue?.title ?? 'Evento'}</h1>
        <p className="mt-1 text-base text-app-muted">
          Suma lo que quieres, paga y retira en {venue?.pickupLabel ?? 'la barra'}{' '}
          con tu número y QR. Sin comisión de red.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`rounded-2xl py-3 text-base font-medium ${
            panel === 'carta' ? 'bg-app-accent text-white' : 'bg-app-chip'
          }`}
          onClick={() => setPanel('carta')}
        >
          Carta
        </button>
        <button
          type="button"
          className={`rounded-2xl py-3 text-base font-medium ${
            panel === 'pedidos' ? 'bg-app-accent text-white' : 'bg-app-chip'
          }`}
          onClick={() => setPanel('pedidos')}
        >
          {readyCount > 0
            ? `Pedidos · ${readyCount} listo${readyCount === 1 ? '' : 's'}`
            : pendingOrders.length > 0
              ? `Pedidos (${pendingOrders.length})`
              : 'Pedidos'}
        </button>
      </div>

      {panel === 'carta' ? (
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Productos</h2>
        {products.length === 0 ? (
          <p className="text-sm text-app-muted">Aún no hay carta en esta barra.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => {
              const qty = cart[product.id] ?? 0
              const soldOut = product.stock <= 0
              return (
                <article key={product.id} className="flex flex-col rounded-[28px] bg-app-card">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-56 w-full bg-[#1c1c1e] object-contain"
                    />
                  ) : null}
                  <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-xl font-semibold">{product.name}</h3>
                  <p className="mt-1 text-lg text-white/90">
                    {formatAmount(product.price)}
                    {product.asset.toUpperCase() === stellarConfig.loyalty.code
                      ? ''
                      : ` ${product.asset}`}
                  </p>
                  {product.promo ? (
                    <p className="mt-1 text-sm text-app-accent">{product.promo.label}</p>
                  ) : null}
                  <p className={`mt-1 text-sm ${stockCountClass(product.stock)}`}>
                    {formatStockLabel(product.stock)}
                    <span className="text-app-muted"> · {product.pickupLabel}</span>
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-4">
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
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      ) : null}

      {panel === 'carta' && lines.length > 0 ? (
        <button
          type="button"
          className="sticky bottom-24 z-20 w-full lg:bottom-6 rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)] disabled:opacity-60"
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

      {panel === 'pedidos' ? (
      <>
      {pendingOrders.length > 0 ||
      placed?.status === 'preparing' ||
      placed?.status === 'ready' ||
      placed?.status === 'awaiting_choice' ? (
        <section className="grid gap-3 sm:grid-cols-2 sm:items-start xl:grid-cols-3">
          <h2 className="col-span-full text-xl font-semibold">Pedidos</h2>
          {placed &&
          (placed.status === 'preparing' ||
            placed.status === 'ready' ||
            placed.status === 'awaiting_choice') ? (
            <CustomerOrderTicket
              order={placed}
              products={products}
              busy={busy}
              onReplace={(productId, replacementProductId) =>
                void resolveLine(placed.id, productId, 'replace', replacementProductId)
              }
              onRefund={(productId) => void resolveLine(placed.id, productId, 'refund')}
            />
          ) : null}
          {pendingOrders
            .filter((order) => order.id !== placed?.id)
            .map((order) => (
              <CustomerOrderTicket
                key={order.id}
                order={order}
                products={products}
                busy={busy}
                onReplace={(productId, replacementProductId) =>
                  void resolveLine(order.id, productId, 'replace', replacementProductId)
                }
                onRefund={(productId) => void resolveLine(order.id, productId, 'refund')}
              />
            ))}
        </section>
      ) : null}

      {paidOrders.length > 0 || placed?.status === 'completed' ? (
        <section className="grid gap-3 sm:grid-cols-2">
          <h2 className="col-span-full text-xl font-semibold">Recogidos</h2>
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
        <section className="grid gap-3 sm:grid-cols-2">
          <h2 className="col-span-full text-sm font-medium text-app-muted">Cancelados</h2>
          {cancelledOrders.map((order) => (
            <CustomerOrderTicket key={order.id} order={order} compact />
          ))}
        </section>
      ) : null}

      {pendingOrders.length === 0 && paidOrders.length === 0 && cancelledOrders.length === 0 ? (
        <p className="text-sm text-app-muted">Todavía no tienes pedidos en esta barra.</p>
      ) : null}
      </>
      ) : null}

      <ErrorModal message={error} onClose={() => setError(null)} />
      <SuccessModal
        title="Pedido actualizado"
        message={notice}
        onClose={() => setNotice(null)}
      />
      {busy ? <PaymentPendingNotice /> : null}
      {receipt ? (
        <OrderReceipt
          order={receipt.order}
          hash={receipt.hash}
          onClose={() => setReceipt(null)}
        />
      ) : null}
      {stockAlert ? (
        <MissingProductNotice
          order={stockAlert}
          onClose={() => {
            setStockAlert(null)
            setReceipt(null)
            setPanel('pedidos')
          }}
        />
      ) : null}
      {readyAlert ? (
        <OrderReadyNotice order={readyAlert} onClose={() => setReadyAlert(null)} />
      ) : null}
      {swap ? (
        <StockSwapSheet
          swap={swap}
          onPick={applySwap}
          onKeep={keepAvailable}
          onClose={() => setSwap(null)}
        />
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
          Estamos confirmando el pedido. No cierres esta pantalla. La comisión de
          red la cubre PartyPay.
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
          Orden lista
        </p>
        <h2 id="order-ready-title" className="mt-2 text-center text-3xl font-semibold">
          #{order.orderNumber}
        </h2>
        <p className="mt-3 text-center text-[15px] leading-relaxed">
          Ve a {order.pickupLabel} a retirar tu pedido.
        </p>
        {order.pickupQr ? <PickupQr value={order.pickupQr} /> : null}
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

function OrderReceipt({
  order,
  hash,
  onClose,
}: {
  order: EventOrder
  hash: string
  onClose: () => void
}) {
  const feeBps = order.feeBps ?? 0
  const percent = feeBps > 0 ? `${(feeBps / 100).toLocaleString('es-CR')} %` : ''
  const expert = hash ? stellarExpertTx(hash) : ''

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="order-confirmed-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-[28px] border border-app-accent/40 bg-app-card p-6 shadow-[0_0_40px_rgba(255,255,255,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-app-chip text-white"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-center text-xs font-medium uppercase tracking-wide text-app-accent">
          Pedido pagado
        </p>
        <h2 id="order-confirmed-title" className="mt-1 text-center text-4xl font-semibold">
          #{order.orderNumber}
        </h2>
        {order.pickupQr ? <PickupQr value={order.pickupQr} /> : null}
        <p className="text-center text-sm text-app-muted">
          Muestra este QR en {order.pickupLabel}.
        </p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Pagaste" value={formatAmount(order.total)} />
          <Row label="La barra recibió" value={formatAmount(order.net ?? order.total)} />
          <Row
            label={percent ? `PartyPay ${percent}` : 'PartyPay'}
            value={formatAmount(order.fee ?? '0')}
          />
        </dl>
        <p className="mt-3 text-center text-sm text-app-muted">Sin comisión de red.</p>
        {expert ? (
          <a
            href={expert}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-center text-sm font-medium text-app-accent"
          >
            Ver el pago
          </a>
        ) : null}
        <p className="mt-3 text-center text-[15px] leading-relaxed text-app-muted">
          Te avisaremos cuando el pedido esté listo.
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white"
          onClick={onClose}
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}

function MissingProductNotice({
  order,
  onClose,
}: {
  order: EventOrder
  onClose: () => void
}) {
  const missing = order.items.filter((item) => item.unavailable)
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="missing-product-title"
    >
      <div className="relative w-full max-w-sm rounded-[28px] border border-app-accent/50 bg-app-card p-6">
        <button
          type="button"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-app-chip text-white"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-center text-xs font-medium uppercase tracking-wide text-app-accent">
          La barra no tiene
        </p>
        <h2 id="missing-product-title" className="mt-2 text-center text-2xl font-semibold">
          #{order.orderNumber}
        </h2>
        <ul className="mt-4 space-y-2 text-sm">
          {missing.map((item) => (
            <li key={item.productId}>
              {item.qty}× {item.name}. Pagaste {formatAmount(item.lineTotal)} {order.asset}.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-app-muted">
          Elige otro producto o pide el reembolso. Si el cambio sale más caro, el
          contrato cobra la diferencia. Si sale más barato o lo reembolsas, te
          devuelve la diferencia.
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-[28px] bg-app-accent py-5 text-xl font-semibold text-white"
          onClick={onClose}
        >
          Aceptar
        </button>
      </div>
    </div>
  )
}

function PickupQr({ value }: { value: string }) {
  return (
    <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
      <QRCodeSVG value={value} size={196} level="M" includeMargin />
    </div>
  )
}

function StockSwapSheet({
  swap,
  onPick,
  onKeep,
  onClose,
}: {
  swap: StockSwap
  onPick: (alternative: StockAlternative) => void
  onKeep: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/80 p-4 backdrop-blur-sm sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="stock-swap-title"
    >
      <div className="w-full max-w-sm rounded-[28px] border border-app-accent/40 bg-app-card p-6">
        <h2 id="stock-swap-title" className="text-xl font-semibold">
          {swap.name} se acabó
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          {swap.available > 0
            ? `Quedan ${swap.available}. Elige esos, o cambia el pedido por otro producto.`
            : 'Elige otro producto con stock para completar el pedido.'}
        </p>
        {swap.available > 0 ? (
          <button
            type="button"
            className="mt-4 w-full rounded-2xl bg-app-chip py-3 text-sm font-medium"
            onClick={onKeep}
          >
            Quedarme con {swap.available}
          </button>
        ) : null}
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {swap.alternatives.length === 0 ? (
            <li className="text-sm text-app-muted">No hay otro producto disponible.</li>
          ) : (
            swap.alternatives.map((alternative) => (
              <li key={alternative.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-app-chip px-4 py-3 text-left"
                  onClick={() => onPick(alternative)}
                >
                  <span className="text-sm font-medium">{alternative.name}</span>
                  <span className="shrink-0 text-xs text-app-muted">
                    {alternative.stock} disp.
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <button
          type="button"
          className="mt-4 w-full rounded-2xl py-3 text-sm font-medium text-app-muted"
          onClick={onClose}
        >
          Seguir eligiendo
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-app-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function stellarExpertTx(hash: string): string {
  const network = stellarConfig.networkPassphrase === Networks.PUBLIC ? 'public' : 'testnet'
  return `https://stellar.expert/explorer/${network}/tx/${hash}`
}
