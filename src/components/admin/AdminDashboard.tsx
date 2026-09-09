import { useEffect, useMemo, useState } from 'react'
import { Building2, Landmark, Shield, Users } from 'lucide-react'
import { ActivityList } from '@/components/dashboard/ActivityList'
import { AdminFinancePanel } from '@/components/admin/AdminFinancePanel'
import { StructuringDashboard } from '@/components/rwa/StructuringDashboard'
import { fetchAdminOverview } from '@/lib/admin/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { shortenPublicKey } from '@/lib/userDisplay'
import { stellarConfig } from '@/lib/stellar/config'
import { formatUsd } from '@/lib/rwa/format'
import type { AdminMerchantRow, TokenTotals } from '@/types/admin'

export function AdminDashboard() {
  const [tab, setTab] = useState<'finance' | 'merchants' | 'customers' | 'rwa'>('finance')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof fetchAdminOverview>
  > | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAdminOverview()
      .then((next) => {
        if (!cancelled) {
          setOverview(next)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedMerchant = overview?.merchants.find((row) => row.id === selectedId)
  const selectedCustomer = overview?.customers.find((row) => row.id === selectedId)

  const activityItems = useMemo(
    () => selectedCustomer?.payments ?? [],
    [selectedCustomer],
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Super admin
        </p>
        <h1 className="mt-1 text-xl font-semibold">Distribuidor</h1>
        <p className="mt-1 break-all font-mono text-[11px] text-app-muted">
          {overview?.distributorPublicKey ?? '…'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          icon={Building2}
          label="Empresas"
          value={String(overview?.merchants.length ?? '—')}
        />
        <SummaryCard
          icon={Users}
          label="Clientes"
          value={String(overview?.customers.length ?? '—')}
        />
        <SummaryCard
          icon={Landmark}
          label="AUM RWA"
          value={overview ? formatUsd(overview.finance.rwaAumUsd) : '—'}
        />
        <SummaryCard
          icon={Shield}
          label="GMV USDC"
          value={overview ? formatUsd(overview.finance.merchantGmvUsdc) : '—'}
        />
      </div>

      {overview ? (
        <section className="rounded-[24px] bg-app-card p-4">
          <h2 className="text-sm font-semibold">Ventas de empresas por token</h2>
          <TokenList totals={overview.merchantSalesTotal} empty="Aún no hay ventas." />
        </section>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <TabButton
          active={tab === 'finance'}
          label="Finanzas"
          onClick={() => {
            setTab('finance')
            setSelectedId(null)
          }}
        />
        <TabButton
          active={tab === 'merchants'}
          label="Empresas"
          onClick={() => {
            setTab('merchants')
            setSelectedId(null)
          }}
        />
        <TabButton
          active={tab === 'customers'}
          label="Clientes"
          onClick={() => {
            setTab('customers')
            setSelectedId(null)
          }}
        />
        <TabButton
          active={tab === 'rwa'}
          label="RWA"
          onClick={() => {
            setTab('rwa')
            setSelectedId(null)
          }}
        />
      </div>

      {loading ? (
        <p className="text-sm text-app-muted">Cargando panel…</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {tab === 'finance' && overview ? (
        <AdminFinancePanel finance={overview.finance} />
      ) : null}

      {tab === 'rwa' ? <StructuringDashboard /> : null}

      {tab === 'merchants' && overview ? (
        <ul className="space-y-2">
          {overview.merchants.length === 0 ? (
            <li className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
              No hay empresas registradas.
            </li>
          ) : null}
          {overview.merchants.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() =>
                  setSelectedId((current) => (current === row.id ? null : row.id))
                }
                className={`w-full rounded-[24px] px-4 py-3 text-left ${
                  selectedId === row.id ? 'bg-app-card' : 'bg-app-chip'
                }`}
              >
                <p className="text-sm font-medium">{row.placeName || row.email}</p>
                <p className="mt-0.5 text-xs text-app-muted">{row.email}</p>
                <p className="mt-0.5 font-mono text-[11px] text-white/60">
                  {shortenPublicKey(row.publicKey)}
                </p>
                <p className="mt-2 text-[11px] text-white/75">
                  {row.receivedCount} pagos recibidos
                </p>
                <TokenList totals={row.sales} empty="Sin ventas todavía." compact />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'customers' && overview ? (
        <ul className="space-y-2">
          {overview.customers.length === 0 ? (
            <li className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
              No hay clientes registrados.
            </li>
          ) : null}
          {overview.customers.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() =>
                  setSelectedId((current) => (current === row.id ? null : row.id))
                }
                className={`w-full rounded-[24px] px-4 py-3 text-left ${
                  selectedId === row.id ? 'bg-app-card' : 'bg-app-chip'
                }`}
              >
                <p className="text-sm font-medium">{row.email}</p>
                <p className="mt-0.5 font-mono text-[11px] text-white/60">
                  {shortenPublicKey(row.publicKey)}
                </p>
                <p className="mt-1 text-[11px] text-white/75">
                  {row.payments.length} movimientos
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedMerchant ? (
        <MerchantDetail row={selectedMerchant} />
      ) : null}

      {selectedCustomer ? (
        <ActivityList
          publicKey={selectedCustomer.publicKey}
          items={activityItems}
          loading={false}
          error={null}
        />
      ) : null}
    </div>
  )
}

function MerchantDetail({ row }: { row: AdminMerchantRow }) {
  return (
    <section className="rounded-[24px] bg-app-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
        Empresa
      </p>
      <h2 className="mt-1 text-lg font-semibold">{row.placeName || row.email}</h2>
      <p className="mt-1 text-sm text-white/80">{row.email}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-app-muted">
        {row.publicKey}
      </p>
      <h3 className="mt-4 text-sm font-semibold">Ventas por token</h3>
      <TokenList totals={row.sales} empty="Esta empresa aún no ha recibido pagos." />
    </section>
  )
}

function TokenList({
  totals,
  empty,
  compact,
}: {
  totals: TokenTotals
  empty: string
  compact?: boolean
}) {
  const ordered = saleTokenOrder(totals)
  const hasAny = ordered.some((asset) => Number(totals[asset] ?? '0') > 0)
  if (!hasAny && ordered.length === 0) {
    return (
      <p className={`text-app-muted ${compact ? 'mt-1 text-[11px]' : 'mt-2 text-sm'}`}>
        {empty}
      </p>
    )
  }
  return (
    <ul className={compact ? 'mt-1 space-y-0.5' : 'mt-2 space-y-1'}>
      {ordered.map((asset) => (
        <li
          key={asset}
          className={`flex justify-between tabular-nums ${
            compact ? 'text-[11px] text-white/80' : 'text-sm'
          }`}
        >
          <span>{asset}</span>
          <span>{formatAmount(totals[asset] ?? '0')}</span>
        </li>
      ))}
    </ul>
  )
}

function saleTokenOrder(totals: TokenTotals): string[] {
  const preferred = ['XLM', 'USDC', stellarConfig.loyalty.code]
  const extra = Object.keys(totals).filter(
    (asset) => !preferred.includes(asset),
  )
  return [...preferred, ...extra]
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Shield
  label: string
  value: string
}) {
  return (
    <div className="rounded-[20px] bg-app-card p-4">
      <Icon className="h-4 w-4 text-app-accent" />
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-app-muted">{label}</p>
    </div>
  )
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-2xl px-3 py-2.5 text-sm font-medium ${
        active ? 'bg-app-accent text-white' : 'bg-app-chip text-white/75'
      }`}
    >
      {label}
    </button>
  )
}
