import { useState } from 'react'
import { AssetCard } from '@/components/rwa/AssetCard'
import { AssetDetailModal } from '@/components/rwa/AssetDetailModal'
import { useRwa } from '@/lib/rwa/RwaContext'
import type { MarketplaceListing } from '@/types/rwa'

export default function RwaMarketplacePage() {
  const { listings, loading, error } = useRwa()
  const [selected, setSelected] = useState<MarketplaceListing | null>(null)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Invertir
        </p>
        <h1 className="mt-1 text-xl font-semibold">Mercado de activos reales</h1>
        <p className="mt-1 text-sm text-app-muted">
          Emisiones aprobadas, con respaldo legal en Costa Rica y liquidación en USDC.
        </p>
      </div>
      {loading ? <p className="text-sm text-app-muted">Cargando listados…</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
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
