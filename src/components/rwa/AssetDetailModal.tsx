import { useState, type FormEvent } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { X } from 'lucide-react'
import { InvestmentInsights } from '@/components/rwa/InvestmentInsights'
import { useRwa } from '@/lib/rwa/RwaContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { useAccountBalances } from '@/lib/stellar/useAccountBalances'
import { formatUsd } from '@/lib/rwa/format'
import { remainingCapacityUsd } from '@/lib/rwa/insights'
import { readableError } from '@/lib/auth/readableError'
import { type MarketplaceListing } from '@/types/rwa'
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
  const remaining = remainingCapacityUsd(listing)

  async function onInvest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setHash(null)
    if (Number(amount) < Number(listing.minInvestmentUsd)) {
      setError(`La inversión mínima es ${formatUsd(listing.minInvestmentUsd)}.`)
      return
    }
    if (Number(amount) > remaining) {
      setError(`Solo queda cupo por ${formatUsd(remaining)}.`)
      return
    }
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

        <div className="mt-4">
          <InvestmentInsights
            listing={listing}
            amount={amount}
            usdcBalance={balances.usdc}
            onAmountChange={setAmount}
          />
        </div>

        <p className="mt-4 text-[11px] text-app-muted">
          Emisor {shortenPublicKey(listing.issuerPublicKey)} · el token viaja por trustline Stellar;
          el cobro ante incumplimiento es el contrato costarricense, no un smart contract.
        </p>

        <div className="mt-4 grid gap-2">
          <button type="button" className="rounded-2xl bg-app-chip py-2.5 text-sm text-white/80">
            Descargar PDF legal (placeholder)
          </button>
          <button type="button" className="rounded-2xl bg-app-chip py-2.5 text-sm text-white/80">
            Contrato / RUGM (placeholder)
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={(event) => void onInvest(event)}>
          <h3 className="text-sm font-semibold">Confirmar compra con USDC</h3>
          {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
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
            {busy ? 'Abriendo trustline y pagando…' : `Invertir ${formatUsd(amount || 0)}`}
          </button>
        </form>
      </div>
    </div>
  )
}
