import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { fieldClass } from '@/components/auth/AuthLayout'
import { useRwa } from '@/lib/rwa/RwaContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { useAccountBalances } from '@/lib/stellar/useAccountBalances'
import { formatUsd } from '@/lib/rwa/format'
import { readableError } from '@/lib/auth/readableError'
import {
  ASSET_TYPE_LABELS,
  LEGAL_BADGE,
  type MarketplaceListing,
} from '@/types/rwa'
import { shortenPublicKey } from '@/lib/userDisplay'

export function AssetDetailModal({
  listing,
  onClose,
}: {
  listing: MarketplaceListing
  onClose: () => void
}) {
  const { invest } = useRwa()
  const { user } = useAuth()
  const { balances, reload } = useAccountBalances(user?.publicKey ?? '')
  const [amount, setAmount] = useState(listing.minInvestmentUsd)
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onInvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setHash(null)
    if (Number(amount) > Number(balances.usdc)) {
      setError(
        `Saldo USDC insuficiente (${balances.usdc}). Recargue desde Inicio → Agregar.`,
      )
      return
    }
    setBusy(true)
    try {
      const result = await invest({ listingId: listing.id, amount })
      setHash(result.txHash ?? 'registrada')
      void reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-4 sm:place-items-center">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-[24px] bg-app-elevated p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-app-accent">{listing.assetCode}</p>
            <h2 className="mt-1 text-lg font-semibold">{listing.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-app-chip"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/80">{listing.description}</p>
        <p className="mt-3 text-xs text-app-accent">{LEGAL_BADGE[listing.legalBacking]}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Tipo" value={ASSET_TYPE_LABELS[listing.assetType]} />
          <Row label="APY" value={`${listing.apy}%`} />
          <Row label="Levantado" value={`${formatUsd(listing.raisedUsd)} / ${formatUsd(listing.targetUsd)}`} />
          <Row label="Mínimo" value={formatUsd(listing.minInvestmentUsd)} />
          <Row label="Suministro" value={listing.totalSupply} />
          <Row label="Emisor" value={shortenPublicKey(listing.issuerPublicKey)} />
        </dl>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            className="rounded-2xl bg-app-chip py-2.5 text-sm text-white/80"
          >
            Descargar PDF legal (placeholder)
          </button>
          <button
            type="button"
            className="rounded-2xl bg-app-chip py-2.5 text-sm text-white/80"
          >
            Contrato / RUGM (placeholder)
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={(event) => void onInvest(event)}>
          <h3 className="text-sm font-semibold">Invertir con USDC</h3>
          <p className="text-xs text-app-muted">
            Abre la trustline del token {listing.assetCode} y transfiere USDC desde su wallet
            custodial. Saldo USDC: {balances.usdc}
          </p>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {hash ? (
            <p className="break-all text-xs text-app-accent">
              Inversión enviada · {hash}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-60"
          >
            {busy ? 'Abriendo trustline y pagando…' : 'Invertir'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-app-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}
