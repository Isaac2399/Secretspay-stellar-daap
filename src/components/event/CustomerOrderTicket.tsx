import { QRCodeSVG } from 'qrcode.react'
import type { EventOrder, EventProduct, EventProductPromo } from '@/types/event'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

const STATUS_LABEL: Record<EventOrder['status'], string> = {
  preparing: 'En preparación',
  ready: 'Listo para retirar',
  awaiting_choice: 'Hay que cambiar o reembolsar',
  completed: 'Recogido',
  cancelled: 'Cancelado',
}

export function CustomerOrderTicket({
  order,
  compact = false,
  products = [],
  busy = false,
  onReplace,
  onRefund,
}: {
  order: EventOrder
  compact?: boolean
  products?: EventProduct[]
  busy?: boolean
  onReplace?: (productId: string, replacementProductId: string) => void
  onRefund?: (productId: string) => void
}) {
  if (compact) {
    return (
      <article className="rounded-2xl bg-app-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              #{order.orderNumber} · {STATUS_LABEL[order.status]}
            </p>
            <p className="mt-0.5 truncate text-xs text-app-muted">
              {order.items.map((item) => `${item.qty}× ${item.name}`).join(', ')}
            </p>
          </div>
          <p className="shrink-0 text-sm tabular-nums">
            {formatAmount(order.total)} {order.asset}
          </p>
        </div>
      </article>
    )
  }

  return (
    <article className="space-y-4 rounded-[24px] bg-app-card p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          {order.merchantName}
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          #{order.orderNumber}
        </h2>
        <p className="mt-1 text-sm text-white/80">{STATUS_LABEL[order.status]}</p>
        <p className="mt-1 text-sm text-app-muted">
          Retira en {order.pickupLabel}
        </p>
      </div>
      {order.pickupQr && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'awaiting_choice' ? (
        <div className="flex justify-center rounded-2xl bg-white p-4">
          <QRCodeSVG value={order.pickupQr} size={200} level="M" includeMargin />
        </div>
      ) : null}
      <ul className="space-y-3 text-sm">
        {order.items.map((item) => {
              const options = item.unavailable
            ? products.filter(
                (product) =>
                  product.id !== item.productId &&
                  product.asset === order.asset &&
                  product.stock >= item.qty &&
                  !order.items.some((row) => row.productId === product.id),
              )
            : []
          return (
            <li key={`${order.id}-${item.productId}`} className="space-y-2">
              <div className="flex justify-between gap-3">
                <span>
                  {item.qty}× {item.name}
                  {item.promoLabel ? (
                    <span className="text-app-accent"> · {item.promoLabel}</span>
                  ) : null}
                  {item.unavailable ? (
                    <span className="text-app-accent"> · ya no hay en la barra</span>
                  ) : null}
                </span>
                <span>
                  {formatAmount(item.lineTotal)} {order.asset}
                </span>
              </div>
              {item.unavailable && onRefund ? (
                <div className="space-y-2 rounded-2xl bg-app-chip p-3">
                  <p className="text-xs leading-relaxed text-app-muted">
                    Pagaste {formatAmount(item.lineTotal)} {order.asset} por esta línea. El
                    contrato cobra o devuelve solo la diferencia.
                  </p>
                  {options.map((product) => {
                    const next = quoteLine(product, item.qty)
                    const paid = Number(item.lineTotal)
                    const delta = next - (Number.isFinite(paid) ? paid : 0)
                    const same = Math.abs(delta) < 0.0000001
                    return (
                    <button
                      key={product.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-app-card px-3 py-2 text-left disabled:opacity-60"
                      disabled={busy}
                      onClick={() => onReplace?.(item.productId, product.id)}
                    >
                      <span>
                        {item.qty}× {product.name}
                        <span className="mt-0.5 block text-xs text-app-muted">
                          {same
                            ? 'Mismo precio'
                            : delta > 0
                              ? `Pagas ${formatAmount(String(delta))} más`
                              : `Te devuelven ${formatAmount(String(-delta))}`}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatAmount(String(next))} {product.asset}
                      </span>
                    </button>
                    )
                  })}
                  {options.length === 0 ? (
                    <p className="text-xs text-app-muted">No hay otro producto con stock suficiente.</p>
                  ) : null}
                  <button
                    type="button"
                    className="w-full rounded-xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
                    disabled={busy}
                    onClick={() => onRefund(item.productId)}
                  >
                    Reembolsar y recibir {formatAmount(item.lineTotal)} {order.asset}
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="text-sm font-medium">
        Total {formatAmount(order.total)} {order.asset}
      </p>
    </article>
  )
}

function quoteLine(product: EventProduct, qty: number): number {
  const paidQty = payableQty(qty, product.promo)
  const discount = Math.min(Math.max(product.promo?.discountPct ?? 0, 0), 100) / 100
  return Number(product.price) * paidQty * (1 - discount)
}

function payableQty(qty: number, promo?: EventProductPromo): number {
  const buyQty = promo?.buyQty ?? 0
  const getQty = promo?.getQty ?? 0
  if (buyQty <= 0 || getQty <= 0) {
    return qty
  }
  const group = buyQty + getQty
  return qty - Math.floor(qty / group) * getQty
}
