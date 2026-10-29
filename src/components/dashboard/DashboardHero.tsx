import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  ScanLine,
} from 'lucide-react'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { hasUsdcTrustline, type AccountBalances } from '@/lib/stellar/getBalances'
import { stellarConfig } from '@/lib/stellar/config'
import { AddFundsSheet } from '@/components/dashboard/DepositOnRamp'
import {
  displayNameFromEmail,
  handleFromEmail,
  initialsFromEmail,
  shortenPublicKey,
} from '@/lib/userDisplay'
import type { AppUser } from '@/types/user'
import type { Sep24Transaction } from '@/lib/sep24/types'

type DashboardHeroProps = {
  user: AppUser
  balances: AccountBalances
  error: string | null
  onScan: () => void
  onSend: () => void
  onDepositCompleted?: (tx: Sep24Transaction) => void
  onRojosCredited?: () => void
  /** Vista cliente: solo el saldo ROJOS, sin XLM, USDC ni envío. */
  loyaltyOnly?: boolean
  /** Botones que van en la misma columna que Agregar ROJOS. */
  customerActions?: ReactNode
}

export const customerActionClass =
  'm-0 box-border flex h-[4.25rem] w-full items-center justify-center gap-3 rounded-[28px] border-0 px-5 text-lg font-semibold leading-none no-underline min-[380px]:text-xl'

type AssetKey = 'loyalty' | 'xlm' | 'usdc'

export function DashboardHero({
  user,
  balances,
  error,
  onScan,
  onSend,
  onDepositCompleted,
  onRojosCredited,
  loyaltyOnly = false,
  customerActions,
}: DashboardHeroProps) {
  const [asset, setAsset] = useState<AssetKey>('loyalty')
  const [copied, setCopied] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)

  const assets = useMemo(() => {
    const loyalty = {
      key: 'loyalty' as const,
      code: stellarConfig.loyalty.code,
      value: balances.loyalty,
    }
    if (loyaltyOnly) {
      return [loyalty]
    }
    return [
      loyalty,
      { key: 'xlm' as const, code: 'XLM', value: balances.xlm },
      { key: 'usdc' as const, code: 'USDC', value: balances.usdc },
    ]
  }, [balances, loyaltyOnly])

  const selected = assets.find((item) => item.key === asset) ?? assets[0]
  const others = assets.filter((item) => item.key !== selected.key)

  useEffect(() => {
    if (!copied) {
      return
    }
    const id = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(id)
  }, [copied])

  async function copyPublicKey() {
    await navigator.clipboard.writeText(user.publicKey)
    setCopied(true)
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-chip text-sm font-semibold">
            {initialsFromEmail(user.email)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium leading-tight">
              {displayNameFromEmail(user.email)}
            </p>
            <p className="truncate text-xs text-app-muted">
              {handleFromEmail(user.email)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onScan}
          aria-label={loyaltyOnly ? 'Pagar con QR' : 'Escanear QR'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-app-card"
        >
          <ScanLine className="h-6 w-6" />
        </button>
      </div>

      <div>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 break-all text-4xl font-semibold tracking-tight tabular-nums min-[380px]:text-5xl">
            {formatAmount(selected.value)}
          </span>
          <span className="text-lg font-medium text-white/55">{selected.code}</span>
        </p>
        {loyaltyOnly ? null : (
          <>
            <p className="mt-3 text-xs text-app-muted">Toca un token para verlo en grande</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {others.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setAsset(item.key)}
                  className="rounded-full bg-app-chip px-3 py-1.5 text-sm text-white/80"
                >
                  <span className="tabular-nums">{formatAmount(item.value)}</span> {item.code}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-app-muted">Testnet · no es saldo fiat</p>
          </>
        )}
        {error ? <ErrorModal message={error} /> : null}

        {loyaltyOnly ? null : (
          <button
            type="button"
            onClick={() => void copyPublicKey()}
            className="mt-4 inline-flex max-w-full items-center gap-2 rounded-full bg-app-chip px-3 py-1.5 text-xs text-white/80"
          >
            <span className="truncate font-mono">{shortenPublicKey(user.publicKey)}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0" />
            )}
            {copied ? 'Copiada' : 'Copiar key'}
          </button>
        )}
      </div>

      {loyaltyOnly ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setReceiveOpen(true)}
            className={`${customerActionClass} bg-app-card text-white`}
          >
            <ArrowDownLeft className="h-7 w-7 shrink-0" />
            Agregar dinero
          </button>
          {customerActions}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <QuickAction
            icon={ArrowDownLeft}
            label="Agregar"
            onClick={() => setReceiveOpen(true)}
          />
          <QuickAction icon={ArrowUpRight} label="Enviar" onClick={onSend} />
        </div>
      )}

      {receiveOpen ? (
        <AddFundsSheet
          publicKey={user.publicKey}
          copied={copied}
          hasUsdcTrustline={hasUsdcTrustline(balances)}
          onCopy={() => void copyPublicKey()}
          onClose={() => setReceiveOpen(false)}
          onDepositCompleted={onDepositCompleted}
          onRojosCredited={onRojosCredited}
        />
      ) : null}
    </section>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ArrowUpRight
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[22px] bg-app-card px-3 py-4 text-[13px] font-medium"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  )
}
