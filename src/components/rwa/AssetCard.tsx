import { ASSET_TYPE_LABELS, LEGAL_BADGE, type MarketplaceListing } from '@/types/rwa'
import { formatUsd, progressPercent } from '@/lib/rwa/format'

export function AssetCard({
  listing,
  onOpen,
}: {
  listing: MarketplaceListing
  onOpen: (listing: MarketplaceListing) => void
}) {
  const progress = progressPercent(listing.raisedUsd, listing.targetUsd)

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
        <p className="text-right text-lg font-semibold tabular-nums">
          {listing.apy}%
          <span className="block text-[11px] font-normal text-app-muted">APY</span>
        </p>
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
        {formatUsd(listing.raisedUsd)} de {formatUsd(listing.targetUsd)} · mín.{' '}
        {formatUsd(listing.minInvestmentUsd)}
      </p>
    </button>
  )
}
