import { useEffect, useMemo, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { ArrowDownLeft, ArrowUpRight, Inbox } from 'lucide-react'
import { readableError } from '@/lib/auth/readableError'
import { fetchMySinpe, retryMySinpe, type UnassignedDeposit } from '@/lib/sinpe/api'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import type { AccountActivity } from '@/lib/stellar/getPayments'
import { shortenPublicKey } from '@/lib/userDisplay'

const INITIAL_VISIBLE = 3
const MORE_STEP = 6

type ActivityFilter = 'all' | 'sent' | 'received' | 'sinpe'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'sent', label: 'Enviadas' },
  { id: 'received', label: 'Recibidas' },
  { id: 'sinpe', label: 'Recargas SINPE' },
]

type SinpeCredit = {
  id?: string
  referenceId: string
  status: string
  calculatedRojos: number
  crcAmount?: number
  stellarHash?: string
  createdAt?: string
  timestamp?: number
  error?: string
  comment?: string
}

type ActivityListProps = {
  publicKey: string
  items: AccountActivity[]
  loading: boolean
  error: string | null
  includeSinpe?: boolean
}

export function ActivityList({
  publicKey,
  items,
  loading,
  error,
  includeSinpe = false,
}: ActivityListProps) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [sinpeCredits, setSinpeCredits] = useState<SinpeCredit[]>([])
  const [sinpeDeposits, setSinpeDeposits] = useState<UnassignedDeposit[]>([])
  const [retrying, setRetrying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
    setFilter('all')
  }, [publicKey])

  useEffect(() => {
    if (!includeSinpe) {
      return
    }
    let cancelled = false
    void fetchMySinpe()
      .then((result) => {
        if (cancelled) {
          return
        }
        setSinpeCredits(result.transactions)
        setSinpeDeposits(result.deposits)
      })
      .catch(() => {
        if (!cancelled) {
          setSinpeCredits([])
          setSinpeDeposits([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [includeSinpe, items])

  const merged = useMemo(
    () =>
      includeSinpe
        ? mergeSinpeActivity(items, sinpeCredits, sinpeDeposits)
        : items,
    [includeSinpe, items, sinpeCredits, sinpeDeposits],
  )

  const filtered = useMemo(
    () => merged.filter((item) => matchesFilter(item, filter)),
    [merged, filter],
  )

  const shown = filtered.slice(0, visible)
  const hasMore = filtered.length > visible
  const pending = sinpeDeposits.some((row) => row.status === 'PENDING_MANUAL_MATCH')

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">Transacciones</h2>
      {includeSinpe ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFilter(item.id)
                setVisible(INITIAL_VISIBLE)
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === item.id
                  ? 'bg-app-accent text-white'
                  : 'bg-app-chip text-white/75'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-[24px] bg-app-card">
        {loading && merged.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">
            Cargando actividad…
          </p>
        ) : null}

        {error && merged.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-app-muted">
            No se pudo cargar la actividad.
          </p>
        ) : null}
        {error ? <ErrorModal message={error} /> : null}

        {!loading && !error && filtered.length === 0 ? (
          <div className="grid place-items-center gap-2 px-4 py-10 text-center">
            <Inbox className="h-8 w-8 text-app-muted" />
            <p className="text-sm font-medium">
              {filter === 'all' ? 'Sin movimientos aún' : 'Nada en este filtro'}
            </p>
            <p className="text-xs text-app-muted">
              {filter === 'sinpe'
                ? 'Las recargas SINPE aparecen aquí, junto al resto de movimientos.'
                : filter === 'all'
                  ? `Cuando envíes o recibas ${publicKey ? 'fondos' : 'tokens'}, aparecerán aquí.`
                  : 'Prueba otro filtro para ver más movimientos.'}
            </p>
          </div>
        ) : null}

        {filtered.length > 0 ? (
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

        {includeSinpe && pending ? (
          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              disabled={retrying}
              className="w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-40"
              onClick={() => {
                setRetrying(true)
                setNotice(null)
                void retryMySinpe()
                  .then(async (result) => {
                    const failed = result.results.find((row) => !row.ok)
                    setNotice(
                      failed?.error ??
                        (result.results.some((row) => row.ok)
                          ? 'Recarga acreditada en Stellar'
                          : 'No había recargas para reintentar'),
                    )
                    const next = await fetchMySinpe()
                    setSinpeDeposits(next.deposits)
                    setSinpeCredits(next.transactions)
                  })
                  .catch((err) => setNotice(readableError(err)))
                  .finally(() => setRetrying(false))
              }}
            >
              {retrying ? 'Reintentando…' : 'Reintentar acreditación'}
            </button>
            {notice ? <p className="mt-2 text-xs text-app-muted">{notice}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function matchesFilter(item: AccountActivity, filter: ActivityFilter): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'sinpe') {
    return item.channel === 'sinpe'
  }
  if (filter === 'sent') {
    return item.kind === 'sent'
  }
  return item.kind === 'received' || item.kind === 'funded'
}

function mergeSinpeActivity(
  horizon: AccountActivity[],
  credits: SinpeCredit[],
  deposits: UnassignedDeposit[],
): AccountActivity[] {
  const sinpe = [
    ...credits.map(creditToActivity),
    ...deposits
      .filter(
        (row) =>
          !credits.some(
            (credit) => credit.referenceId === row.referenceId && credit.stellarHash,
          ),
      )
      .map(depositToActivity),
  ]
  const used = new Set<string>()
  const tagged = horizon.map((item) => {
    const match = sinpe.find(
      (row) => !used.has(row.id) && sameSinpeCredit(item, row),
    )
    if (!match) {
      return item
    }
    used.add(match.id)
    return {
      ...item,
      channel: 'sinpe' as const,
      memo: match.memo || item.memo,
      crcAmount: match.crcAmount,
      detailError: match.detailError,
      status: match.status === 'pending' ? item.status : match.status,
    }
  })
  const extras = sinpe.filter((row) => !used.has(row.id))
  return [...extras, ...tagged].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

function creditToActivity(row: SinpeCredit): AccountActivity {
  return {
    id: `sinpe:${row.id ?? row.referenceId}`,
    hash: row.stellarHash ?? '',
    kind: 'received',
    amount: String(row.calculatedRojos),
    asset: 'ROJOS',
    counterparty: '',
    memo: sinpeMemo(row.crcAmount, row.comment, row.referenceId),
    createdAt: row.createdAt || isoFromTimestamp(row.timestamp),
    status: row.status === 'FAILED' || row.error ? 'failed' : row.stellarHash ? 'success' : 'pending',
    channel: 'sinpe',
    crcAmount: row.crcAmount != null ? String(row.crcAmount) : undefined,
    detailError: row.error,
  }
}

function depositToActivity(row: UnassignedDeposit): AccountActivity {
  const onChain = Boolean(row.stellarHash)
  return {
    id: `sinpe-deposit:${row.id}`,
    hash: row.stellarHash ?? '',
    kind: 'received',
    amount: String(row.calculatedRojos),
    asset: 'ROJOS',
    counterparty: '',
    memo: sinpeMemo(row.crcAmount, row.comment, row.referenceId),
    createdAt: row.createdAt || isoFromTimestamp(row.timestamp),
    status: row.lastError ? 'failed' : onChain ? 'success' : 'pending',
    channel: 'sinpe',
    crcAmount: String(row.crcAmount),
    detailError: row.lastError,
  }
}

function sinpeMemo(crcAmount: number | undefined, comment: string | undefined, referenceId: string): string {
  const crc =
    crcAmount != null ? `₡${formatAmount(String(crcAmount))}` : ''
  const note = (comment ?? '').trim()
  return [crc, note || referenceId].filter(Boolean).join(' · ')
}

function isoFromTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return new Date(0).toISOString()
  }
  const ms = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
  return new Date(ms).toISOString()
}

function sameSinpeCredit(horizon: AccountActivity, sinpe: AccountActivity): boolean {
  if (sinpe.hash && horizon.hash === sinpe.hash) {
    return true
  }
  if (horizon.kind !== 'received' || horizon.asset !== 'ROJOS' || sinpe.asset !== 'ROJOS') {
    return false
  }
  const sameAmount =
    Number(horizon.amount) === Number(sinpe.amount) && Number(horizon.amount) > 0
  const horizonTime = new Date(horizon.createdAt).getTime()
  const sinpeTime = new Date(sinpe.createdAt).getTime()
  const closeInTime =
    Number.isFinite(horizonTime) &&
    Number.isFinite(sinpeTime) &&
    Math.abs(horizonTime - sinpeTime) < 30 * 60_000
  return sameAmount && closeInTime && sinpe.status !== 'pending'
}

function ActivityRow({ item }: { item: AccountActivity }) {
  const outgoing = item.kind === 'sent'
  const title =
    item.channel === 'sinpe'
      ? 'Recarga SINPE'
      : item.kind === 'funded'
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
  const statusLabel =
    item.status === 'failed' ? 'Fallido' : item.status === 'pending' ? 'Pendiente' : 'Confirmado'

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
        {item.detailError ? (
          <p className="mt-0.5 truncate text-[11px] text-red-400">{item.detailError}</p>
        ) : null}
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
