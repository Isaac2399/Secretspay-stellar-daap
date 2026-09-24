import { useMemo, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { useNavigate } from 'react-router-dom'
import { AreaChart, DonutChart } from '@/components/charts/Charts'
import { useRwa } from '@/lib/rwa/RwaContext'
import { estimatedMonthlyYieldUsd, formatUsd, nextPayoutLabel, poolSharePercent } from '@/lib/rwa/format'
import {
  allocationSlices,
  claimedReturnPercent,
  listingFrequency,
  monthlyYieldUsd,
  portfolioProjection,
} from '@/lib/rwa/insights'
import { readableError } from '@/lib/auth/readableError'
import type { AccountActivity } from '@/lib/stellar/getPayments'

const SLICE_COLORS = ['#1c8c62', '#60a5fa', '#fbbf24', '#a78bfa', '#f87171']

export function InvestorPortfolio({
  activity = [],
  compact = false,
}: {
  activity?: AccountActivity[]
  compact?: boolean
}) {
  const { holdings, listings, claim } = useRwa()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apyByListing = useMemo(
    () => Object.fromEntries(listings.map((row) => [row.id, row.apy])),
    [listings],
  )
  const invested = holdings.reduce((sum, row) => sum + Number(row.investedUsd), 0)
  const claimed = holdings.reduce((sum, row) => sum + Number(row.claimedDividendsUsd), 0)
  const monthly = estimatedMonthlyYieldUsd(holdings, apyByListing)
  const roi = claimedReturnPercent(invested, claimed)
  const dividendOps = activity.filter((item) =>
    /^(DIV|INV-|DIVID)/i.test(item.memo),
  )
  const slices = allocationSlices(holdings, listings)
  const projection = useMemo(
    () => portfolioProjection(holdings, listings, 12),
    [holdings, listings],
  )

  async function onClaim() {
    setBusy(true)
    setError(null)
    try {
      await claim()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  if (holdings.length === 0 && compact) {
    return null
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Mis dividendos
        </p>
        <h2 className="mt-1 text-[17px] font-semibold">Portafolio RWA</h2>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Stat label="Capital invertido" value={formatUsd(invested)} />
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Renta mensual est." value={formatUsd(monthly)} />
          <Stat label="Dividendos cobrados" value={formatUsd(claimed)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Retorno cobrado" value={`${roi.toFixed(2)}%`} />
          <Stat
            label="Renta 12 meses est."
            value={formatUsd(projection.at(-1)?.cumulative ?? monthly * 12)}
          />
        </div>
      </div>

      {holdings.length === 0 ? (
        <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
          Todavía no tiene tokens RWA. Explore oportunidades para abrir trustline e invertir en USDC.
        </p>
      ) : (
        <ul className="space-y-2">
          {holdings.map((holding) => {
            const listing = listings.find((row) => row.id === holding.listingId)
            const share = poolSharePercent(holding.tokens, listing?.totalSupply ?? '0')
            const holdingMonthly = listing
              ? monthlyYieldUsd(Number(holding.investedUsd), Number(listing.apy))
              : 0
            return (
              <li key={holding.listingId} className="rounded-[20px] bg-app-card p-4">
                <p className="font-mono text-xs text-app-accent">{holding.assetCode}</p>
                <p className="mt-1 text-sm font-semibold">{listing?.name ?? holding.assetCode}</p>
                <p className="mt-1 text-xs text-app-muted">
                  {formatUsd(holding.investedUsd)} · {share.toFixed(2)}% del pool · APY {listing?.apy ?? '—'}%
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Renta est. {formatUsd(holdingMonthly)} / mes · cobrado {formatUsd(holding.claimedDividendsUsd)}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Próximo pago: {nextPayoutLabel(listing?.nextPayoutDate ?? '')}
                  {listing ? ` · ${listingFrequency(listing) === 'quarterly' ? 'trimestral' : 'mensual'}` : ''}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      {!compact && holdings.length > 0 ? (
        <>
          <div className="rounded-[24px] bg-app-card p-4">
            <AreaChart
              title="Ganancia proyectada del portafolio"
              caption="Suma de rentas esperadas a 12 meses si el APY de cada ficha se mantiene. Source: portafolio actual."
              xLabel="Mes"
              yLabel="USDC acumulados"
              formatY={(value) => formatUsd(value)}
              series={[
                {
                  name: 'Renta acumulada',
                  colorClass: 'stroke-app-accent',
                  fillClass: 'fill-app-accent/20',
                  points: projection.map((point) => ({
                    label: point.label,
                    value: point.cumulative,
                  })),
                },
              ]}
            />
          </div>
          {slices.length > 0 ? (
            <div className="rounded-[24px] bg-app-card p-4">
              <DonutChart
                title="Asignación de capital"
                caption="Distribución del USDC invertido entre emisiones."
                formatValue={(value) => formatUsd(value)}
                slices={slices.map((slice, index) => ({
                  ...slice,
                  color: SLICE_COLORS[index % SLICE_COLORS.length] ?? '#1c8c62',
                }))}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        disabled={busy || holdings.length === 0}
        onClick={() => void onClaim()}
        className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-50"
      >
        {busy ? 'Registrando cobro…' : 'Cobrar dividendos del periodo'}
      </button>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      {dividendOps.length > 0 ? (
        <div className="rounded-[20px] bg-app-card p-4">
          <p className="text-sm font-semibold">Pagos on-chain (memo)</p>
          <ul className="mt-2 space-y-2">
            {dividendOps.slice(0, 6).map((item) => (
              <li key={item.id} className="text-xs text-white/75">
                {item.amount} {item.asset} · {item.memo || 'sin memo'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {compact ? (
        <button
          type="button"
          onClick={() => navigate('/rwa/dividendos')}
          className="text-sm text-app-accent"
        >
          Ver gráficos y detalle
        </button>
      ) : null}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-app-card p-4">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
