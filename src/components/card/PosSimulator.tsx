import { useState, type FormEvent } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { SmartphoneNfc } from 'lucide-react'
import { fieldClass } from '@/components/auth/AuthLayout'
import { AuthSubmitButton } from '@/components/auth/formHelpers'
import { simulateCardTransaction } from '@/lib/cards/api'
import type { CardAuthorization } from '@/lib/cards/types'
import { readableError } from '@/lib/auth/readableError'

type PosSimulatorProps = {
  cardId: string
  onSettled: (authorization: CardAuthorization) => void
}

export function PosSimulator({ cardId, onSettled }: PosSimulatorProps) {
  const [open, setOpen] = useState(false)
  const [merchant, setMerchant] = useState('Starbucks')
  const [amount, setAmount] = useState('15.00')
  const [currency, setCurrency] = useState<'USDC' | 'XLM'>('USDC')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<CardAuthorization | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const authorization = await simulateCardTransaction({
        cardId,
        merchant: merchant.trim(),
        amount: amount.trim(),
        currency,
      })
      setLast(authorization)
      onSettled(authorization)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-[24px] border border-dashed border-white/15 bg-app-card/80 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <p className="text-[11px] font-medium uppercase tracking-wide text-app-accent">
            Sandbox
          </p>
          <p className="mt-0.5 text-sm font-semibold">Simulador de datáfono</p>
        </span>
        <SmartphoneNfc className="h-5 w-5 text-white/70" />
      </button>

      {open ? (
        <form className="mt-4 grid gap-3" onSubmit={(event) => void onSubmit(event)}>
          <p className="text-xs text-app-muted">
            Simula un cargo Visa. Si hay saldo, se debita en Stellar Testnet hacia
            la tesorería de la plataforma.
          </p>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Comercio
            <input
              className={fieldClass}
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              maxLength={28}
              required
            />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="grid gap-1.5 text-sm font-medium text-white/80">
              Monto
              <input
                className={fieldClass}
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-white/80">
              Asset
              <select
                className={fieldClass}
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value === 'XLM' ? 'XLM' : 'USDC')
                }
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
              </select>
            </label>
          </div>
          {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
          {last ? <AuthorizationResult authorization={last} /> : null}
          <AuthSubmitButton
            submitting={submitting}
            idleLabel="Cobrar en datáfono"
            busyLabel="Autorizando…"
          />
        </form>
      ) : (
        <p className="mt-2 text-xs text-app-muted">
          Prueba un cargo de {amount} {currency} en {merchant}.
        </p>
      )}
    </section>
  )
}

function AuthorizationResult({
  authorization,
}: {
  authorization: CardAuthorization
}) {
  const approved = authorization.status === 'approved'
  return (
    <div
      className={`rounded-2xl px-3 py-3 text-sm ${
        approved ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
      }`}
    >
      <p className="font-medium">
        {approved ? 'Cargo aprobado' : 'Autorización rechazada'}
      </p>
      <p className="mt-1 text-xs opacity-90">
        {authorization.merchant} · {authorization.amount} {authorization.currency}
      </p>
      {authorization.declineReason ? (
        <p className="mt-1 text-xs">{authorization.declineReason}</p>
      ) : null}
      {authorization.stellarExpertUrl ? (
        <a
          href={authorization.stellarExpertUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-[#f5c400] underline-offset-2 hover:underline"
        >
          Ver tx en StellarExpert
        </a>
      ) : null}
      {authorization.txHash ? (
        <p className="mt-2 break-all font-mono text-[10px] text-white/55">
          {authorization.txHash}
        </p>
      ) : null}
    </div>
  )
}
