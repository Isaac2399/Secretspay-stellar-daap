import { useEffect, useState } from 'react'
import { Ban, ExternalLink, Inbox, Store } from 'lucide-react'
import type { CardAuthorization } from '@/lib/cards/types'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

const INITIAL_VISIBLE = 3
const MORE_STEP = 6

export function CardTransactions({
  items,
  loading,
}: {
  items: CardAuthorization[]
  loading: boolean
}) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [items[0]?.id])

  const shown = items.slice(0, visible)
  const hasMore = items.length > visible
  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">Movimientos de la tarjeta</h2>
      <div className="overflow-hidden rounded-[24px] bg-app-card">
        {loading && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">
            Cargando cargos…
          </p>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="grid place-items-center gap-2 px-4 py-10 text-center">
            <Inbox className="h-8 w-8 text-app-muted" />
            <p className="text-sm font-medium">Sin cargos aún</p>
            <p className="text-xs text-app-muted">
              Usa el simulador de datáfono para probar un cobro en Testnet.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <ul className="divide-y divide-white/10">
              {shown.map((item) => (
                <TransactionRow key={item.id} item={item} />
              ))}
            </ul>
            {hasMore ? (
              <button
                type="button"
                onClick={() => setVisible((count) => count + MORE_STEP)}
                className="w-full border-t border-white/10 py-3 text-sm font-medium text-app-accent"
              >
                Ver más
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  )
}

function TransactionRow({ item }: { item: CardAuthorization }) {
  const approved = item.status === 'approved'
  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          approved ? 'bg-white/10 text-white/80' : 'bg-red-400/15 text-red-300'
        }`}
      >
        {approved ? <Store className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.merchant}</p>
        <p className="truncate text-xs text-app-muted">
          {formatWhen(item.createdAt)} · {approved ? 'Aprobado' : 'Rechazado'}
        </p>
        {item.declineReason ? (
          <p className="truncate text-[11px] text-red-300/90">{item.declineReason}</p>
        ) : null}
        {item.stellarExpertUrl ? (
          <a
            href={item.stellarExpertUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-app-accent"
          >
            StellarExpert
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
      <p
        className={`shrink-0 text-sm font-medium tabular-nums ${
          approved ? 'text-white/80' : 'text-red-300'
        }`}
      >
        {approved ? '−' : ''}
        {formatAmount(item.amount)} {item.currency}
      </p>
    </li>
  )
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
