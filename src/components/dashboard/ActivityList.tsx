import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { ArrowDownLeft, ArrowUpRight, Inbox } from 'lucide-react'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { AccountActivity } from '@/lib/stellar/getPayments'
import { shortenPublicKey } from '@/lib/userDisplay'

const INITIAL_VISIBLE = 3
const MORE_STEP = 6

type ActivityListProps = {
  publicKey: string
  items: AccountActivity[]
  loading: boolean
  error: string | null
}

export function ActivityList({
  publicKey,
  items,
  loading,
  error,
}: ActivityListProps) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [publicKey])

  const shown = items.slice(0, visible)
  const hasMore = items.length > visible

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">Transacciones</h2>
      <div className="overflow-hidden rounded-[24px] bg-app-card">
        {loading && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">
            Cargando actividad…
          </p>
        ) : null}

        {error && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">
            No se pudo cargar la actividad.
          </p>
        ) : null}
        {error ? <ErrorModal message={error} /> : null}

        {!loading && !error && items.length === 0 ? (
          <div className="grid place-items-center gap-2 px-4 py-10 text-center">
            <Inbox className="h-8 w-8 text-app-muted" />
            <p className="text-sm font-medium">Sin movimientos aún</p>
            <p className="text-xs text-app-muted">
              Cuando envíes o recibas {publicKey ? 'fondos' : 'tokens'}, aparecerán
              aquí.
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <ul className="divide-y divide-white/10">
              {shown.map((item) => (
                <ActivityRow key={item.id} item={item} />
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

function ActivityRow({ item }: { item: AccountActivity }) {
  const outgoing = item.kind === 'sent'
  const title =
    item.kind === 'funded'
      ? 'Cuenta activada'
      : outgoing
        ? 'Enviado'
        : item.asset === 'USDC'
          ? 'Depósito USDC'
          : 'Recibido'
  const detail = item.memo.trim()
    ? item.memo
    : item.counterparty
      ? shortenPublicKey(item.counterparty)
      : item.asset === 'USDC'
        ? 'Ancla SEP-24'
        : 'Horizon'
  const statusLabel = item.status === 'failed' ? 'Fallido' : 'Confirmado'

  return (
    <li className="flex items-center gap-3 px-4 py-3.5">
      <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          outgoing ? 'bg-white/10 text-white/80' : 'bg-app-accent/15 text-app-accent'
        }`}
      >
        {outgoing ? (
          <ArrowUpRight className="h-4 w-4" />
        ) : (
          <ArrowDownLeft className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-app-muted">{detail}</p>
        <p className="mt-0.5 text-[11px] text-app-muted">
          {formatWhen(item.createdAt)} · {statusLabel}
        </p>
      </div>
      <p
        className={`shrink-0 text-sm font-medium tabular-nums ${
          outgoing ? 'text-white/80' : 'text-app-accent'
        }`}
      >
        {outgoing ? '−' : '+'}
        {formatAmount(item.amount)} {item.asset}
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
