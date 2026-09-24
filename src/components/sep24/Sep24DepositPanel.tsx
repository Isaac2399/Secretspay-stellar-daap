import { useEffect, useState, type FormEvent } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Banknote, CheckCircle2, CreditCard, ExternalLink, LoaderCircle } from 'lucide-react'
import {
  CardCheckoutFields,
  emptyCardCheckout,
  validateCardCheckout,
  type CardCheckoutValues,
} from '@/components/sep24/CardCheckoutFields'
import { fetchSep24DepositLimits } from '@/lib/sep24/stellarSep24'
import { useSep24Deposit } from '@/lib/sep24/useSep24Deposit'
import type { Sep24AmountLimits, Sep24Rail, Sep24Transaction } from '@/lib/sep24/types'

const COPY: Record<
  Sep24Rail,
  {
    intro: string
    cta: string
    iframeTitle: string
    pendingTransfer: string
    done: string
  }
> = {
  cash: {
    intro:
      'En Testnet el ancla de SDF (testanchor.stellar.org) simula un depósito en efectivo tipo MoneyGram. Completa el flujo SEP-24 en la ventana del ancla; si falta la trustline de USDC, se crea sola.',
    cta: 'Continuar con efectivo',
    iframeTitle: 'Depósito en efectivo (SEP-24)',
    pendingTransfer: 'Confirma el pago de prueba en el ancla',
    done: 'El ancla acreditó USDC en tu cuenta Stellar de Testnet.',
  },
  card: {
    intro:
      'En Testnet el ancla de SDF simula un cargo con tarjeta. Valida la tarjeta de prueba aquí y completa el SEP-24 en la ventana del ancla; el USDC llega a tu cuenta.',
    cta: 'Pagar con tarjeta',
    iframeTitle: 'Confirmación del ancla (tarjeta)',
    pendingTransfer: 'Autorizando el cargo de prueba',
    done: 'El cargo de prueba se completó y el USDC ya está en tu cuenta.',
  },
}

export function Sep24DepositPanel({
  rail,
  hasUsdcTrustline,
  onCompleted,
}: {
  rail: Sep24Rail
  hasUsdcTrustline: boolean
  onCompleted?: (tx: Sep24Transaction) => void
}) {
  const deposit = useSep24Deposit(onCompleted)
  const copy = COPY[rail]
  const [amount, setAmount] = useState('')
  const [card, setCard] = useState<CardCheckoutValues>(emptyCardCheckout)
  const [cardError, setCardError] = useState<string | null>(null)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [limits, setLimits] = useState<Sep24AmountLimits>({
    minAmount: 1,
    maxAmount: 10,
  })
  const [anchorHost, setAnchorHost] = useState('testanchor.stellar.org')

  useEffect(() => {
    let cancelled = false
    void fetchSep24DepositLimits()
      .then((next) => {
        if (!cancelled && (next.minAmount != null || next.maxAmount != null)) {
          setLimits({
            minAmount: next.minAmount ?? 1,
            maxAmount: next.maxAmount ?? 10,
          })
        }
        if (!cancelled && next.homeDomain) {
          setAnchorHost(next.homeDomain)
        }
      })
      .catch(() => {
        // Keep the test-anchor fallback range (typically 1–10 USDC).
      })
    return () => {
      cancelled = true
    }
  }, [])

  const showStartForm =
    !deposit.session &&
    (deposit.phase === 'idle' || deposit.phase === 'error')

  const min = limits.minAmount ?? 1
  const max = limits.maxAmount ?? 10
  const amountValue = Number(amount.trim().replace(',', '.'))
  const amountOutOfRange =
    Boolean(amount.trim()) &&
    (!Number.isFinite(amountValue) || amountValue < min || amountValue > max)
  const busy = deposit.phase === 'trustline' || deposit.phase === 'starting'

  async function onStart(event: FormEvent) {
    event.preventDefault()
    setCardError(null)
    const raw = amount.trim().replace(',', '.')
    if (raw) {
      const value = Number(raw)
      if (!Number.isFinite(value) || value < min || value > max) {
        return
      }
    }
    if (rail === 'card') {
      const invalid = validateCardCheckout(card)
      if (invalid) {
        setCardError(invalid)
        return
      }
    }
    setPopupBlocked(false)
    const popup = window.open(
      'about:blank',
      'sep24-deposit',
      'popup,width=480,height=760',
    )
    const session = await deposit.start(raw || undefined, rail)
    if (!session?.url) {
      popup?.close()
      return
    }
    if (popup) {
      popup.location.replace(session.url)
      popup.focus()
      return
    }
    setPopupBlocked(true)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">{copy.intro}</p>
      <p className="text-xs text-app-muted">Ancla: {anchorHost}</p>

      {!hasUsdcTrustline && deposit.phase === 'idle' ? (
        <p className="rounded-2xl bg-app-chip px-3 py-2 text-xs text-app-muted">
          Esta cuenta aún no confía USDC. Se creará la trustline al depositar.
        </p>
      ) : null}

      {showStartForm ? (
        <form className="space-y-3" onSubmit={(event) => void onStart(event)}>
          <label className="grid gap-1 text-sm">
            Monto USDC (opcional, {min}–{max} en este ancla)
            <input
              className="rounded-2xl border border-app-line bg-app-chip px-3 py-2 text-sm"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Ej. ${Math.min(max, Math.max(min, 5))}`}
            />
          </label>
          {amountOutOfRange ? (
            <p className="text-sm text-red-400">
              El ancla de prueba acepta entre {min} y {max} USDC.
            </p>
          ) : null}

          {rail === 'card' ? (
            <CardCheckoutFields
              value={card}
              onChange={(next) => {
                setCardError(null)
                setCard(next)
              }}
              error={cardError}
            />
          ) : null}

          <button
            type="submit"
            disabled={busy || amountOutOfRange}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-accent py-3 text-sm font-medium text-black disabled:opacity-60"
          >
            {busy ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : rail === 'card' ? (
              <CreditCard className="h-4 w-4" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {deposit.phase === 'trustline'
              ? 'Abriendo trustline USDC…'
              : deposit.phase === 'starting'
                ? 'Autenticando SEP-10…'
                : copy.cta}
          </button>
        </form>
      ) : null}

      {deposit.phase === 'starting' ? (
        <p className="text-sm text-app-muted">
          Autenticando SEP-10 y pidiendo la URL interactiva SEP-24…
        </p>
      ) : null}

      {deposit.session ? (
        <InteractiveFrame
          url={deposit.session.url}
          title={copy.iframeTitle}
          popupBlocked={popupBlocked}
          tx={deposit.transaction}
          pendingTransferLabel={copy.pendingTransfer}
        />
      ) : null}

      {deposit.phase === 'completed' ? (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/15 p-4 text-sm text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Depósito completado</p>
            <p className="mt-1 text-emerald-200/80">{copy.done}</p>
          </div>
        </div>
      ) : null}

      {deposit.error ? <ErrorModal message={deposit.error} /> : null}

      {deposit.phase === 'error' && deposit.errorCode === 'expired_session' ? (
        <button
          type="button"
          onClick={() => deposit.reset()}
          className="w-full rounded-2xl bg-app-chip py-3 text-sm"
        >
          Reintentar sesión
        </button>
      ) : null}
    </div>
  )
}

function InteractiveFrame({
  url,
  title,
  popupBlocked,
  tx,
  pendingTransferLabel,
}: {
  url: string
  title: string
  popupBlocked: boolean
  tx: Sep24Transaction | null
  pendingTransferLabel: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <a
          href={url}
          target="sep24-deposit"
          rel="opener"
          className="inline-flex items-center gap-1 text-xs text-app-accent"
        >
          Abrir en ventana
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="rounded-2xl bg-app-chip p-3 text-sm text-app-muted">
        {popupBlocked
          ? 'El navegador bloqueó la ventana. Toca Abrir en ventana; el estado se sigue consultando aquí.'
          : 'Completa el depósito en la ventana del ancla. Si no se abrió, usa Abrir en ventana.'}
      </p>
      {popupBlocked ? (
        <iframe
          title={title}
          src={url}
          className="h-[52vh] w-full rounded-2xl bg-black"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}
      <TransactionStatus tx={tx} pendingTransferLabel={pendingTransferLabel} />
    </div>
  )
}

function TransactionStatus({
  tx,
  pendingTransferLabel,
}: {
  tx: Sep24Transaction | null
  pendingTransferLabel: string
}) {
  if (!tx) {
    return <p className="text-xs text-app-muted">Esperando estado del ancla…</p>
  }

  return (
    <div className="rounded-2xl bg-app-chip p-3 text-sm">
      <p className="font-medium">{statusLabel(tx.status, pendingTransferLabel)}</p>
      {tx.message ? <p className="mt-1 text-app-muted">{tx.message}</p> : null}
      {tx.amount_out ? (
        <p className="mt-1 tabular-nums">
          {tx.amount_out} {tx.amount_out_asset ? 'USDC' : ''}
        </p>
      ) : null}
      {tx.external_transaction_id ? (
        <p className="mt-1 font-mono text-xs text-app-muted">
          Ref {tx.external_transaction_id}
        </p>
      ) : null}
    </div>
  )
}

function statusLabel(status: string, pendingTransferLabel: string): string {
  const labels: Record<string, string> = {
    incomplete: 'Pendiente de datos',
    pending_user_transfer_start: pendingTransferLabel,
    pending_user_transfer_complete: 'Esperando confirmación del pago',
    pending_anchor: 'El ancla está procesando',
    pending_stellar: 'Enviando USDC en Stellar',
    pending_external: 'Procesando fuera de Stellar',
    pending_trust: 'Falta trustline de USDC',
    pending_user: 'Acción pendiente en el ancla',
    completed: 'Completado',
    error: 'Error',
    expired: 'Expirado',
  }
  return labels[status] ?? status
}
