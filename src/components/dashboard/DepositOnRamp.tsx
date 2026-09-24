import { useEffect, useState, type ReactNode } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { AlertTriangle, ArrowLeft, Banknote, Check, Copy, QrCode, Smartphone } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
// MoneyGram (cash) y tarjeta quedan fuera de la vista cliente.
// import { CreditCard } from 'lucide-react'
// import { Sep24DepositPanel } from '@/components/sep24/Sep24DepositPanel'
import { claimSinpe, fetchSinpeIntent } from '@/lib/sinpe/api'
import { AuthApiError } from '@/lib/auth/api'
import { readableError } from '@/lib/auth/readableError'
import { stellarConfig } from '@/lib/stellar/config'
import type { Sep24Transaction } from '@/lib/sep24/types'

type AddFundsSheetProps = {
  publicKey: string
  copied: boolean
  hasUsdcTrustline: boolean
  onCopy: () => void
  onClose: () => void
  onDepositCompleted?: (tx: Sep24Transaction) => void
  onRojosCredited?: () => void
}

type FundsView = 'pick' | 'cash' | 'card' | 'efectivo' | 'receive' | 'sinpe'

export function AddFundsSheet({
  publicKey,
  copied,
  onCopy,
  onClose,
  onRojosCredited,
}: AddFundsSheetProps) {
  const [view, setView] = useState<FundsView>('pick')
  const [claimOpen, setClaimOpen] = useState(false)

  const title =
    view === 'efectivo'
      ? 'Efectivo'
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
              icon={<Smartphone className="h-5 w-5" />}
              title="SINPE Móvil"
              subtitle="Envía al número y pega el código"
              onClick={() => setView('sinpe')}
            />
            <MethodCard
              icon={<Banknote className="h-5 w-5" />}
              title="Efectivo"
              subtitle="Depósito en los stands de Stellar"
              onClick={() => setView('efectivo')}
            />
            <MethodCard
              icon={<QrCode className="h-5 w-5" />}
              title="Recibir on-chain"
              subtitle="Public key Stellar"
              onClick={() => setView('receive')}
            />
            {/*
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
            */}
          </div>
        ) : null}

        {/*
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
        */}

        {view === 'efectivo' ? <CashAtStand publicKey={publicKey} /> : null}

        {view === 'sinpe' ? (
          <SinpeRecarga onClaim={() => setClaimOpen(true)} />
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
  onClaim,
}: {
  onClaim: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [phoneDisplay, setPhoneDisplay] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchSinpeIntent()
      .then((intent) => {
        if (cancelled) {
          return
        }
        setCode(intent.code)
        setPhone(intent.phone)
        setPhoneDisplay(intent.phoneDisplay)
        setError(null)
      })
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
  }, [])

  async function copyCode() {
    if (!code) {
      return
    }
    await navigator.clipboard.writeText(code)
    setCopiedCode(true)
    window.setTimeout(() => setCopiedCode(false), 1600)
  }

  async function copyPhone() {
    if (!phone) {
      return
    }
    await navigator.clipboard.writeText(phone)
    setCopiedPhone(true)
    window.setTimeout(() => setCopiedPhone(false), 1600)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Envía el SINPE Móvil a nuestro número de teléfono y pega este código en el
        comentario de la transacción.
      </p>
      {loading ? <p className="text-sm text-app-muted">Creando código…</p> : null}
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
      <CopyRow
        label="Número SINPE"
        value={phoneDisplay ?? '……'}
        copied={copiedPhone}
        disabled={!phone}
        onCopy={() => void copyPhone()}
        copyLabel="Copiar número"
        copiedLabel="Número copiado"
      />
      <CopyRow
        label="Código"
        value={code ?? 'sc••••ts'}
        copied={copiedCode}
        disabled={!code}
        onCopy={() => void copyCode()}
        copyLabel="Copiar código"
        copiedLabel="Código copiado"
        mono
      />
      <p className="text-sm text-app-muted">
        En caso de error o no pegar el código deberás enviarnos el número de
        comprobante del SINPE Móvil.
      </p>
      <button
        type="button"
        onClick={onClaim}
        className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-white"
      >
        Ayuda
      </button>
    </div>
  )
}

type ClaimNotice = {
  tone: 'success' | 'warning' | 'error'
  title: string
  message: string
  credited: boolean
}

function ClaimSinpeModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [referenceId, setReferenceId] = useState('')
  const [notice, setNotice] = useState<ClaimNotice | null>(null)
  const [busy, setBusy] = useState(false)

  function dismissNotice() {
    const credited = notice?.credited
    setNotice(null)
    if (credited) {
      onSuccess()
    }
  }

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
        <button
          type="button"
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            const reference = referenceId.trim()
            if (!reference) {
              setNotice({
                tone: 'error',
                title: 'Falta el número',
                message: 'Ingresa el número de transacción del SINPE.',
                credited: false,
              })
              return
            }
            setBusy(true)
            setNotice(null)
            void claimSinpe(reference)
              .then((result) => {
                setNotice({
                  tone: 'success',
                  title: 'Acreditado a tu cuenta',
                  message: result.message,
                  credited: true,
                })
              })
              .catch((err) => setNotice(claimNoticeFromError(err)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Verificando…' : 'Reclamar'}
        </button>
      </div>
      {notice ? <ClaimNoticeModal notice={notice} onClose={dismissNotice} /> : null}
    </div>
  )
}

function claimNoticeFromError(err: unknown): ClaimNotice {
  const code = err instanceof AuthApiError ? err.code : undefined
  const status = err instanceof AuthApiError ? err.status : 0
  const message = readableError(err)
  if (code === 'already_credited') {
    return { tone: 'warning', title: 'Ya está en tu cuenta', message, credited: false }
  }
  if (code === 'already_used' || status === 409) {
    return { tone: 'warning', title: 'Código ya usado', message, credited: false }
  }
  if (code === 'code_mismatch') {
    return { tone: 'error', title: 'No coincide con tu cuenta', message, credited: false }
  }
  if (code === 'not_found' || status === 404) {
    return { tone: 'error', title: 'No coincide', message, credited: false }
  }
  if (code === 'amount_unknown') {
    return { tone: 'error', title: 'Monto no reconocido', message, credited: false }
  }
  if (code === 'missing_reference' || status === 400) {
    return { tone: 'error', title: 'Número inválido', message, credited: false }
  }
  return { tone: 'error', title: 'No se pudo acreditar', message, credited: false }
}

function ClaimNoticeModal({
  notice,
  onClose,
}: {
  notice: ClaimNotice
  onClose: () => void
}) {
  const tone =
    notice.tone === 'success'
      ? {
          panel: 'border-green-500/40 bg-[#102016] shadow-[0_0_40px_rgba(34,197,94,0.28)]',
          badge: 'bg-green-500/15 ring-green-500/50',
          icon: 'text-green-400',
          button: 'bg-green-500',
        }
      : notice.tone === 'warning'
        ? {
            panel: 'border-amber-500/40 bg-[#1c160e] shadow-[0_0_40px_rgba(245,158,11,0.28)]',
            badge: 'bg-amber-500/15 ring-amber-500/50',
            icon: 'text-amber-400',
            button: 'bg-amber-500',
          }
        : {
            panel: 'border-red-500/40 bg-[#1a1010] shadow-[0_0_40px_rgba(239,68,68,0.35)]',
            badge: 'bg-red-500/15 ring-red-500/50',
            icon: 'text-red-400',
            button: 'bg-red-500',
          }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sinpe-claim-title"
      aria-describedby="sinpe-claim-message"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm rounded-[28px] border p-6 ${tone.panel}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full ring-2 ${tone.badge}`}>
          {notice.tone === 'success' ? (
            <Check className={`h-8 w-8 ${tone.icon}`} strokeWidth={2.2} />
          ) : (
            <AlertTriangle className={`h-8 w-8 ${tone.icon}`} strokeWidth={2.2} />
          )}
        </div>
        <h2 id="sinpe-claim-title" className="mt-4 text-center text-xl font-semibold tracking-tight">
          {notice.title}
        </h2>
        <p id="sinpe-claim-message" className="mt-3 text-center text-[15px] leading-relaxed text-white/85">
          {notice.message}
        </p>
        <button
          type="button"
          className={`mt-6 w-full rounded-2xl py-3 text-sm font-semibold text-white ${tone.button}`}
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}

function CashAtStand({ publicKey }: { publicKey: string }) {
  const steps = [
    'Dirígete a los stands de Stellar en el evento.',
    'Deposita tu dinero.',
    'Confirma el public key al que quieres recargar.',
    'Listo, disfruta de tu fiesta.',
  ]

  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step} className="flex gap-3 text-sm text-app-muted">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-chip text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
      <li className="rounded-2xl bg-app-chip px-3 py-3">
        <p className="text-[11px] uppercase tracking-wide text-app-muted">Tu public key</p>
        <p className="mt-1 break-all font-mono text-xs text-white/80">{publicKey}</p>
      </li>
    </ol>
  )
}

function CopyRow({
  label,
  value,
  copied,
  disabled,
  onCopy,
  copyLabel,
  copiedLabel,
  mono = false,
}: {
  label: string
  value: string
  copied: boolean
  disabled?: boolean
  onCopy: () => void
  copyLabel: string
  copiedLabel: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-app-chip px-3 py-3">
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[11px] uppercase tracking-wide text-app-muted">{label}</p>
        <p
          className={`mt-0.5 truncate text-white ${mono ? 'font-mono text-base font-semibold tracking-[0.08em]' : 'font-mono text-lg font-semibold tracking-wide'}`}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        aria-label={copied ? copiedLabel : copyLabel}
        title={copied ? copiedLabel : copyLabel}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 disabled:opacity-40"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
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
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Public key copiada' : 'Copiar public key'}
      </button>
    </>
  )
}
