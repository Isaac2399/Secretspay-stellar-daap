import { useState, type ReactNode } from 'react'
import { ArrowLeft, Banknote, Check, Copy, CreditCard, QrCode, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Sep24DepositPanel } from '@/components/sep24/Sep24DepositPanel'
import { claimSinpe } from '@/lib/sinpe/api'
import { readableError } from '@/lib/auth/readableError'
import { stellarConfig } from '@/lib/stellar/config'
import type { Sep24Transaction } from '@/lib/sep24/types'

type AddFundsSheetProps = {
  publicKey: string
  sinpeCode?: string
  copied: boolean
  hasUsdcTrustline: boolean
  onCopy: () => void
  onClose: () => void
  onDepositCompleted?: (tx: Sep24Transaction) => void
  onRojosCredited?: () => void
}

type FundsView = 'pick' | 'cash' | 'card' | 'receive' | 'sinpe'

export function AddFundsSheet({
  publicKey,
  sinpeCode,
  copied,
  hasUsdcTrustline,
  onCopy,
  onClose,
  onDepositCompleted,
  onRojosCredited,
}: AddFundsSheetProps) {
  const [view, setView] = useState<FundsView>('pick')
  const [claimOpen, setClaimOpen] = useState(false)

  const title =
    view === 'cash'
      ? 'MoneyGram'
      : view === 'card'
        ? 'Tarjeta'
        : view === 'receive'
          ? 'Recibir on-chain'
          : view === 'sinpe'
            ? 'SINPE Móvil'
            : 'Agregar'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-funds-title"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {view !== 'pick' ? (
              <button
                type="button"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-app-chip"
                onClick={() => setView('pick')}
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : null}
            <h2 id="add-funds-title" className="truncate text-lg font-semibold">
              {title}
            </h2>
          </div>
          <button type="button" className="text-sm text-app-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {view === 'pick' ? (
          <div className="grid gap-2">
            <MethodCard
              icon={<Banknote className="h-5 w-5" />}
              title="MoneyGram"
              subtitle="Efectivo en agente · SEP-24"
              onClick={() => setView('cash')}
            />
            <MethodCard
              icon={<CreditCard className="h-5 w-5" />}
              title="Tarjeta"
              subtitle="Visa / Mastercard · SEP-24"
              onClick={() => setView('card')}
            />
            <MethodCard
              icon={<Smartphone className="h-5 w-5" />}
              title="SINPE Móvil"
              subtitle="Nota: tu código de 6 letras (ej. RAKV9E)"
              onClick={() => setView('sinpe')}
            />
            <MethodCard
              icon={<QrCode className="h-5 w-5" />}
              title="Recibir on-chain"
              subtitle="Public key Stellar"
              onClick={() => setView('receive')}
            />
          </div>
        ) : null}

        {view === 'cash' ? (
          <Sep24DepositPanel
            rail="cash"
            hasUsdcTrustline={hasUsdcTrustline}
            onCompleted={onDepositCompleted}
          />
        ) : null}

        {view === 'card' ? (
          <Sep24DepositPanel
            rail="card"
            hasUsdcTrustline={hasUsdcTrustline}
            onCompleted={onDepositCompleted}
          />
        ) : null}

        {view === 'sinpe' ? (
          <SinpeRecarga sinpeCode={sinpeCode} onClaim={() => setClaimOpen(true)} />
        ) : null}

        {view === 'receive' ? (
          <ReceiveOnchain publicKey={publicKey} copied={copied} onCopy={onCopy} />
        ) : null}
        {claimOpen ? (
          <ClaimSinpeModal
            onClose={() => setClaimOpen(false)}
            onSuccess={() => {
              setClaimOpen(false)
              onRojosCredited?.()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function SinpeRecarga({
  sinpeCode,
  onClaim,
}: {
  sinpeCode?: string
  onClaim: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)

  async function copyCode() {
    if (!sinpeCode) {
      return
    }
    await navigator.clipboard.writeText(sinpeCode)
    setCopiedCode(true)
    window.setTimeout(() => setCopiedCode(false), 1600)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        En la nota del SINPE pon solo tu código de 6 caracteres (no la public key).
        Paridad: <span className="text-white">₡1,000 = 1 ROJO</span>. ₡9,000 → 10
        ROJOS.
      </p>
      <p className="rounded-2xl bg-app-chip px-3 py-4 text-center font-mono text-3xl font-semibold tracking-[0.35em] text-white">
        {sinpeCode ?? '……'}
      </p>
      <button
        type="button"
        onClick={() => void copyCode()}
        disabled={!sinpeCode}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-chip py-3 text-sm font-medium disabled:opacity-40"
      >
        {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copiedCode ? 'Código copiado' : 'Copiar código para la nota'}
      </button>
      <button
        type="button"
        onClick={onClaim}
        className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
      >
        ¿No se acreditó tu recarga? Reclamar con comprobante
      </button>
    </div>
  )
}

function ClaimSinpeModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [referenceId, setReferenceId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[28px] bg-app-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Reclamar recarga</h3>
          <button type="button" className="text-sm text-app-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="mb-3 text-sm text-app-muted">
          Ingresa el número de comprobante SINPE (ej. 12345678).
        </p>
        <input
          value={referenceId}
          onChange={(event) => setReferenceId(event.target.value)}
          placeholder="12345678"
          className="w-full rounded-2xl bg-app-chip px-3 py-3 text-sm outline-none"
        />
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {message ? <p className="mt-2 text-sm text-green-400">{message}</p> : null}
        <button
          type="button"
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            setBusy(true)
            setError(null)
            void claimSinpe(referenceId)
              .then((result) => {
                setMessage(result.message)
                onSuccess()
              })
              .catch((err) => setError(readableError(err)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Verificando…' : 'Reclamar'}
        </button>
      </div>
    </div>
  )
}

function MethodCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[22px] bg-app-chip px-4 py-4 text-left"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-app-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-app-muted">{subtitle}</span>
      </span>
    </button>
  )
}

function ReceiveOnchain({
  publicKey,
  copied,
  onCopy,
}: {
  publicKey: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <>
      <p className="mb-4 text-sm text-app-muted">
        Comparte tu public key para recibir XLM, USDC o {stellarConfig.loyalty.code} en
        Testnet.
      </p>
      <div className="mx-auto mb-4 w-fit rounded-2xl bg-white p-3">
        <QRCodeSVG value={publicKey} size={200} level="M" includeMargin />
      </div>
      <p className="mb-3 break-all text-center font-mono text-xs text-white/70">
        {publicKey}
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Public key copiada' : 'Copiar public key'}
      </button>
    </>
  )
}
