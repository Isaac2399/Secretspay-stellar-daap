import { QRCodeSVG } from 'qrcode.react'
import type { EventOrder } from '@/types/event'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

const STATUS_LABEL: Record<EventOrder['status'], string> = {
  preparing: 'En preparación',
  ready: 'Listo para retirar',
  completed: 'Entregado',
  cancelled: 'Cancelado',
}

export function CustomerOrderTicket({
  order,
  compact = false,
}: {
  order: EventOrder
  compact?: boolean
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
      {order.pickupQr && order.status !== 'completed' ? (
        <div className="flex justify-center rounded-2xl bg-white p-4">
          <QRCodeSVG value={order.pickupQr} size={200} level="M" includeMargin />
        </div>
      ) : null}
      <ul className="space-y-1 text-sm">
        {order.items.map((item) => (
          <li key={`${order.id}-${item.productId}`} className="flex justify-between gap-3">
            <span>
              {item.qty}× {item.name}
              {item.promoLabel ? (
                <span className="text-app-accent"> · {item.promoLabel}</span>
              ) : null}
            </span>
            <span>
              {formatAmount(item.lineTotal)} {order.asset}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-sm font-medium">
        Total {formatAmount(order.total)} {order.asset}
      </p>
    </article>
  )
}
