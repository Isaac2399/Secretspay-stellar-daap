import { useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { AssetCard } from '@/components/rwa/AssetCard'
import { AssetDetailModal } from '@/components/rwa/AssetDetailModal'
import { BarList } from '@/components/charts/Charts'
import { useRwa } from '@/lib/rwa/RwaContext'
import { formatUsd, progressPercent } from '@/lib/rwa/format'
import { monthlyYieldUsd } from '@/lib/rwa/insights'
import type { MarketplaceListing } from '@/types/rwa'

export default function RwaMarketplacePage() {
  const { listings, loading, error } = useRwa()
  const [selected, setSelected] = useState<MarketplaceListing | null>(null)
  const ranked = [...listings].sort((a, b) => Number(b.apy) - Number(a.apy))

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Invertir
        </p>
        <h1 className="mt-1 text-xl font-semibold">Mercado de activos reales</h1>
        <p className="mt-1 text-sm text-app-muted">
          Compare APY, cupo, renta mensual del mínimo y respaldo legal antes de comprar.
        </p>
      </div>
      {loading ? <p className="text-sm text-app-muted">Cargando listados…</p> : null}
      {error ? <ErrorModal message={error} /> : null}

      {ranked.length > 0 ? (
        <div className="rounded-[24px] bg-app-card p-4">
          <BarList
            title="Renta mensual estimada (inversión mínima)"
            caption="Comparativo a APY anunciado · no incluye mora ni recortes de ocupación."
            xLabel="USDC por mes"
            yLabel="Activo"
            formatValue={(value) => formatUsd(value)}
            items={ranked.map((listing) => ({
              label: `${listing.assetCode} · ${listing.apy}%`,
              value: monthlyYieldUsd(Number(listing.minInvestmentUsd), Number(listing.apy)),
            }))}
          />
        </div>
      ) : null}

      {ranked.length > 0 ? (
        <div className="overflow-x-auto rounded-[24px] bg-app-card p-4">
          <p className="text-sm font-semibold">Tabla comparativa</p>
          <table className="mt-3 w-full min-w-[28rem] text-left text-[11px]">
            <thead className="text-app-muted">
              <tr>
                <th className="pb-2 font-medium">Activo</th>
                <th className="pb-2 font-medium">APY</th>
                <th className="pb-2 font-medium">Mínimo</th>
                <th className="pb-2 font-medium">Fondeo</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((listing) => (
                <tr key={listing.id} className="border-t border-white/5">
                  <td className="py-2 pr-2">{listing.name}</td>
                  <td className="py-2 tabular-nums">{listing.apy}%</td>
                  <td className="py-2 tabular-nums">{formatUsd(listing.minInvestmentUsd)}</td>
                  <td className="py-2 tabular-nums">
                    {progressPercent(listing.raisedUsd, listing.targetUsd)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-3">
        {listings.map((listing) => (
          <AssetCard key={listing.id} listing={listing} onOpen={setSelected} />
        ))}
      </div>
      {selected ? (
        <AssetDetailModal listing={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}
