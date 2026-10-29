import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { stellarConfig } from '@/lib/stellar/config'
import type { AccountBalances } from '@/lib/stellar/getBalances'

type AccountStripProps = {
  balances: AccountBalances
}

export function AccountStrip({ balances }: AccountStripProps) {
  const loyaltyCode = stellarConfig.loyalty.code
  const hasLoyaltyLine = balances.raw.some(
    (entry) => entry.assetCode?.toUpperCase() === loyaltyCode.toUpperCase(),
  )

  const cards = [
    {
      label: loyaltyCode,
      value: balances.loyalty,
      hint: hasLoyaltyLine ? 'Token de lealtad' : 'Sin trustline',
    },
    {
      label: 'XLM',
      value: balances.xlm,
      hint: 'Nativo',
    },
    {
      label: 'USDC',
      value: balances.usdc,
      hint: 'Testnet',
    },
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold">Activos</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {cards.map((card) => (
          <div
            key={card.label}
            className="min-w-[7.5rem] shrink-0 rounded-[20px] bg-app-card p-4 sm:min-w-0"
          >
            <p className="text-xs text-app-muted">{card.label}</p>
            <p className="mt-2 text-lg font-semibold tabular-nums">
              {formatAmount(card.value)}
            </p>
            <p className="mt-1 text-[11px] text-app-muted">{card.hint}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
