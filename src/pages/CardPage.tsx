import { useCallback, useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { CreditCard, LoaderCircle } from 'lucide-react'
import { CardControls } from '@/components/card/CardControls'
import { CardDepositModal } from '@/components/card/CardDepositModal'
import { CardTransactions } from '@/components/card/CardTransactions'
import { PosSimulator } from '@/components/card/PosSimulator'
import { VirtualCard } from '@/components/card/VirtualCard'
import { WalletSheet } from '@/components/card/WalletSheet'
import { hasUsdcTrustline } from '@/lib/stellar/getBalances'
import {
  fetchCard,
  fetchCardTransactions,
  fetchMyCard,
  fetchSecureDetails,
  freezeCard,
  issueCard,
  unfreezeCard,
} from '@/lib/cards/api'
import type {
  CardAuthorization,
  PublicCard,
  SecureCardDetails,
} from '@/lib/cards/types'
import { ActivityList } from '@/components/dashboard/ActivityList'
import { useAuth } from '@/lib/auth/AuthContext'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount, useAccountBalances } from '@/lib/stellar/useAccountBalances'
import { useRecentActivity } from '@/lib/stellar/useRecentActivity'

const REVEAL_MS = 20_000

export default function CardPage() {
  const { user } = useAuth()
  const { balances, reload } = useAccountBalances(user?.publicKey ?? '')
  const activity = useRecentActivity(user?.publicKey ?? '')
  const [card, setCard] = useState<PublicCard | null>(null)
  const [transactions, setTransactions] = useState<CardAuthorization[]>([])
  const [loading, setLoading] = useState(true)
  const [issuing, setIssuing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<SecureCardDetails | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)

  const loadCard = useCallback(async () => {
    const next = await fetchMyCard()
    setCard(next)
    if (next) {
      setTransactions(await fetchCardTransactions(next.id))
    }
    return next
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void loadCard()
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadCard])

  useEffect(() => {
    if (!revealed) {
      return
    }
    const id = window.setTimeout(() => setRevealed(null), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [revealed])

  async function onIssue() {
    setIssuing(true)
    setError(null)
    try {
      const next = await issueCard()
      setCard(next)
      setTransactions(await fetchCardTransactions(next.id))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setIssuing(false)
    }
  }

  async function onToggleReveal() {
    if (!card) {
      return
    }
    if (revealed) {
      setRevealed(null)
      return
    }
    setRevealing(true)
    setError(null)
    try {
      setRevealed(await fetchSecureDetails(card.id))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setRevealing(false)
    }
  }

  async function onToggleFreeze() {
    if (!card) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next =
        card.status === 'frozen'
          ? await unfreezeCard(card.id)
          : await freezeCard(card.id)
      setCard(next)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSettled(authorization: CardAuthorization) {
    setTransactions((current) => [authorization, ...current])
    if (card) {
      try {
        setCard(await fetchCard(card.id))
      } catch {
        // Keep the optimistic history even if the refresh fails.
      }
    }
    void reload()
  }

  if (!user) {
    return null
  }

  const available = card?.balance.available ?? balances.usdc

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Visa virtual
        </p>
        <h1 className="mt-1 text-xl font-semibold">Tarjeta</h1>
        <p className="mt-1 text-sm text-app-muted">
          Emisión sandbox estilo Rain Cards, liquidada en Stellar Testnet.
        </p>
      </div>

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-app-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Cargando tarjeta…
        </p>
      ) : null}

      {!loading && !card ? (
        <section className="rounded-[24px] bg-app-card p-5">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5">
            <CreditCard className="h-6 w-6 text-app-accent" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Emite tu Visa virtual</h2>
          <p className="mt-2 text-sm text-app-muted">
            Se asocia a tu public key custodial. El saldo gastable es el USDC de
            tu wallet en Testnet. El número completo nunca viaja embebido en la
            página: se pide al API al tocar Ver detalles.
          </p>
          <button
            type="button"
            onClick={() => void onIssue()}
            disabled={issuing}
            className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-black disabled:opacity-60"
          >
            {issuing ? 'Emitiendo…' : 'Emitir tarjeta'}
          </button>
        </section>
      ) : null}

      {card ? (
        <>
          <VirtualCard
            card={card}
            revealed={revealed}
            revealing={revealing}
            onToggleReveal={() => void onToggleReveal()}
          />

          <section className="rounded-[24px] bg-app-card p-4">
            <p className="text-xs text-app-muted">Saldo disponible</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">
              {formatAmount(available)}
              <span className="ml-2 text-base font-medium text-white/50">
                {card.balance.currency}
              </span>
            </p>
            <p className="mt-1 text-xs text-app-muted">
              Refleja el USDC de tu cuenta Stellar · Testnet
            </p>
          </section>

          <CardControls
            card={card}
            busy={busy}
            onToggleFreeze={() => void onToggleFreeze()}
            onAddToWallet={() => setWalletOpen(true)}
            onDepositUsdc={() => setDepositOpen(true)}
          />

          <PosSimulator cardId={card.id} onSettled={(tx) => void onSettled(tx)} />

          <ActivityList
            publicKey={user.publicKey}
            items={activity.items}
            loading={activity.loading}
            error={activity.error}
          />

          <CardTransactions items={transactions} loading={false} />
        </>
      ) : null}

      {walletOpen ? <WalletSheet onClose={() => setWalletOpen(false)} /> : null}
      {depositOpen ? (
        <CardDepositModal
          hasUsdcTrustline={hasUsdcTrustline(balances)}
          onClose={() => setDepositOpen(false)}
          onDepositCompleted={(tx) => {
            void reload()
            void activity.reloadAfterDeposit(tx)
          }}
        />
      ) : null}
    </div>
  )
}
