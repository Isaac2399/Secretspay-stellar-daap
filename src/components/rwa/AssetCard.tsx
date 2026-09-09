import { ASSET_TYPE_LABELS, LEGAL_BADGE, type MarketplaceListing } from '@/types/rwa'
import { Sparkline } from '@/components/charts/Charts'
import { formatUsd, progressPercent } from '@/lib/rwa/format'
import {
  listingFrequency,
  monthlyYieldUsd,
  projectInvestment,
  remainingCapacityUsd,
} from '@/lib/rwa/insights'

export function AssetCard({
  listing,
  onOpen,
}: {
  listing: MarketplaceListing
  onOpen: (listing: MarketplaceListing) => void
}) {
  const progress = progressPercent(listing.raisedUsd, listing.targetUsd)
  const minYield = monthlyYieldUsd(Number(listing.minInvestmentUsd), Number(listing.apy))
  const spark = projectInvestment(
    Number(listing.minInvestmentUsd),
    Number(listing.apy),
    listingFrequency(listing),
    12,
  ).map((point) => point.cumulative)

  return (
    <button
      type="button"
      onClick={() => onOpen(listing)}
      className="w-full rounded-[24px] bg-app-card p-4 text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-app-accent">{listing.assetCode}</p>
          <h3 className="mt-1 text-[15px] font-semibold">{listing.name}</h3>
          <p className="mt-1 text-xs text-app-muted">
            {ASSET_TYPE_LABELS[listing.assetType]}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">
            {listing.apy}%
            <span className="block text-[11px] font-normal text-app-muted">APY</span>
          </p>
          <Sparkline values={spark} label={`Proyección a 12 meses del mínimo en ${listing.name}`} />
        </div>
      </div>
      <p className="mt-3 inline-flex rounded-full bg-app-chip px-2.5 py-1 text-[11px] text-app-accent">
        {LEGAL_BADGE[listing.legalBacking]}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-app-accent"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-app-muted">
        {formatUsd(listing.raisedUsd)} de {formatUsd(listing.targetUsd)} · cupo{' '}
        {formatUsd(remainingCapacityUsd(listing))}
      </p>
      <p className="mt-1 text-xs text-white/75">
        Con el mínimo ({formatUsd(listing.minInvestmentUsd)}) estima {formatUsd(minYield)} / mes
      </p>
    </button>
  )
}
