import { CreditCard, Gauge, Snowflake, Wallet } from 'lucide-react'
import type { PublicCard } from '@/lib/cards/types'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

type CardControlsProps = {
  card: PublicCard
  busy: boolean
  onToggleFreeze: () => void
  onAddToWallet: () => void
  onDepositUsdc: () => void
}

export function CardControls({
  card,
  busy,
  onToggleFreeze,
  onAddToWallet,
  onDepositUsdc,
}: CardControlsProps) {
  const frozen = card.status === 'frozen'
  const daily = card.limits.daily
  const limit = Number(daily.amount)
  const spent = Number(daily.spent)
  const ratio = limit > 0 ? Math.min(1, spent / limit) : 0

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onToggleFreeze}
          disabled={busy}
          className={`flex flex-col items-center gap-2 rounded-[22px] px-3 py-4 text-[13px] font-medium disabled:opacity-60 ${
            frozen
              ? 'bg-[#f5c400] text-black'
              : 'bg-app-card text-white'
          }`}
        >
          <Snowflake className="h-5 w-5" />
          {frozen ? 'Descongelar' : 'Congelar tarjeta'}
        </button>
        <button
          type="button"
          onClick={onAddToWallet}
          className="flex flex-col items-center gap-2 rounded-[22px] bg-app-card px-3 py-4 text-[13px] font-medium"
        >
          <Wallet className="h-5 w-5" />
          Apple / Google Pay
        </button>
      </div>
      <button
        type="button"
        onClick={onDepositUsdc}
        className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-app-accent px-3 py-4 text-[13px] font-medium text-black"
      >
        <CreditCard className="h-5 w-5" />
        Depositar con tarjeta
      </button>

      <div className="rounded-[24px] bg-app-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <Gauge className="h-4 w-4 text-app-accent" />
            Límite diario
          </p>
          <p className="text-xs text-app-muted">{daily.currency}</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-app-accent"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <LimitStat label="Tope" value={formatAmount(daily.amount)} />
          <LimitStat label="Usado" value={formatAmount(daily.spent)} />
          <LimitStat label="Queda" value={formatAmount(daily.remaining)} />
        </div>
      </div>
    </section>
  )
}

function LimitStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-app-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">${value}</p>
    </div>
  )
}
