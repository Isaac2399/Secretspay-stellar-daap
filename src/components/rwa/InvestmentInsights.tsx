import { useMemo } from 'react'
import { fieldClass } from '@/components/auth/AuthLayout'
import { AreaChart } from '@/components/charts/Charts'
import { formatUsd, nextPayoutLabel, progressPercent } from '@/lib/rwa/format'
import {
  horizonTotals,
  investorBrief,
  listingFrequency,
  listingHeadline,
  projectInvestment,
  remainingCapacityUsd,
  scenarioAmounts,
} from '@/lib/rwa/insights'
import {
  ASSET_TYPE_LABELS,
  FREQUENCY_LABELS,
  LEGAL_BADGE,
  type MarketplaceListing,
} from '@/types/rwa'

export function InvestmentInsights({
  listing,
  amount,
  usdcBalance,
  onAmountChange,
}: {
  listing: MarketplaceListing
  amount: string
  usdcBalance: string
  onAmountChange: (value: string) => void
}) {
  const principal = Number(amount) || 0
  const frequency = listingFrequency(listing)
  const remaining = remainingCapacityUsd(listing)
  const funded = progressPercent(listing.raisedUsd, listing.targetUsd)
  const brief = investorBrief(listing.assetType)
  const totals = useMemo(
    () => horizonTotals(principal, Number(listing.apy), frequency),
    [principal, listing.apy, frequency],
  )
  const series = useMemo(
    () => projectInvestment(principal, Number(listing.apy), frequency, 12),
    [principal, listing.apy, frequency],
  )
  const scenarios = scenarioAmounts(listing)
  const periodLabel = FREQUENCY_LABELS[frequency].toLowerCase()

  return (
    <div className="space-y-4">
      <p className="text-xs text-app-accent">{listingHeadline(listing)}</p>
      <p className="text-sm leading-relaxed text-white/80">{listing.description}</p>
      <p className="text-xs text-app-accent">{LEGAL_BADGE[listing.legalBacking]}</p>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Fact label="Tipo" value={ASSET_TYPE_LABELS[listing.assetType]} />
        <Fact label="APY esperado" value={`${listing.apy}%`} />
        <Fact
          label="Levantado"
          value={`${formatUsd(listing.raisedUsd)} / ${formatUsd(listing.targetUsd)}`}
        />
        <Fact label="Disponible" value={formatUsd(remaining)} />
        <Fact label="Mínimo" value={formatUsd(listing.minInvestmentUsd)} />
        <Fact label="Pago" value={`${FREQUENCY_LABELS[frequency]} · ${nextPayoutLabel(listing.nextPayoutDate)}`} />
      </dl>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-app-accent" style={{ width: `${funded}%` }} />
      </div>
      <p className="text-[11px] text-app-muted">{funded}% del objetivo de capital · cupo {formatUsd(remaining)}</p>

      <div className="space-y-2 rounded-[20px] bg-app-chip p-3">
        <p className="text-sm font-semibold">Simule su inversión</p>
        <p className="text-xs text-app-muted">
          Saldo USDC: {usdcBalance}. El gráfico usa el APY anunciado, sin capitalizar (la renta se cobra).
        </p>
        <input
          className={fieldClass}
          inputMode="decimal"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          aria-label="Monto a invertir en USDC"
        />
        <div className="flex flex-wrap gap-1.5">
          {scenarios.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onAmountChange(String(value))}
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                Number(amount) === value ? 'bg-app-accent text-white' : 'bg-black/30 text-white/80'
              }`}
            >
              {formatUsd(value)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label={`Renta ${periodLabel}`} value={formatUsd(totals.period)} />
        <Kpi label="En 12 meses" value={formatUsd(totals.year1)} />
        <Kpi label="En 3 años" value={formatUsd(totals.year3)} />
        <Kpi label="En 5 años" value={formatUsd(totals.year5)} />
      </div>

      <div className="rounded-[20px] bg-app-chip p-3">
        <AreaChart
          title="Renta acumulada proyectada (12 meses)"
          caption="Proyección a APY constante. No es una garantía de pago. Source: ficha del activo · próximos 12 meses."
          xLabel="Mes"
          yLabel="USDC acumulados"
          formatY={(value) => formatUsd(value)}
          series={[
            {
              name: 'Renta acumulada',
              colorClass: 'stroke-app-accent',
              fillClass: 'fill-app-accent/20',
              points: series.map((point) => ({ label: point.label, value: point.cumulative })),
            },
          ]}
        />
      </div>

      <div className="rounded-[20px] bg-app-chip p-3">
        <p className="text-sm font-semibold">{brief.riskLabel}</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/75">
          {brief.bullets.map((bullet) => (
            <li key={bullet}>• {bullet}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-app-chip px-3 py-2">
      <dt className="text-[11px] text-app-muted">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium">{value}</dd>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-app-chip p-3">
      <p className="text-[11px] text-app-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}
