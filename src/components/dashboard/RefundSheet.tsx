import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { requestBalanceRefund } from '@/lib/cash/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'

const CRC_PER_ROJO = 1000

function localDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('506') && digits.length > 8) {
    return digits.slice(3, 11)
  }
  return digits.slice(0, 8)
}

export function RefundSheet({
  loyaltyBalance,
  onClose,
  onRefunded,
}: {
  loyaltyBalance: string
  onClose: () => void
  onRefunded: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [done, setDone] = useState<{
    crc: number
    phone: string
    message: string
  } | null>(null)
  const rojos = Number(loyaltyBalance)
  const canRefund = Number.isFinite(rojos) && rojos > 0
  const crc = canRefund ? Math.round(rojos * CRC_PER_ROJO) : 0
  const phoneReady = phone.length === 8

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
    >
      <div className="w-full max-w-lg rounded-[28px] bg-app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="refund-title" className="text-lg font-semibold">
            Reembolsar por SINPE
          </h2>
          <button type="button" className="text-sm text-app-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-white/80">{done.message}</p>
            <p className="text-3xl font-semibold tabular-nums">
              ₡{done.crc.toLocaleString('es-CR')}
            </p>
            <p className="text-sm text-app-muted">
              El dinero sale por SINPE Móvil al {done.phone}.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/80">
              Lo que no gastaste vuelve por SINPE Móvil. Paridad ₡1,000 por cada unidad de saldo.
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {canRefund ? formatAmount(loyaltyBalance) : '0'} de saldo
              <span className="mt-1 block text-base font-medium text-white/70">
                ₡{crc.toLocaleString('es-CR')}
              </span>
            </p>
            <label className="block text-sm">
              <span className="text-white/80">
                Teléfono donde quieres recibir el dinero
              </span>
              <input
                value={phone}
                onChange={(event) => setPhone(localDigits(event.target.value))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="88887777"
                className="mt-2 w-full rounded-2xl bg-app-chip px-3 py-3 text-lg tracking-wide outline-none"
              />
            </label>
            <p className="text-sm text-app-muted">
              Tiene que ser el número SINPE Móvil de 8 dígitos. Al confirmar, el
              saldo sale de tu cuenta y el dinero se envía a ese teléfono.
            </p>
            {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
            <button
              type="button"
              disabled={!canRefund || !phoneReady || busy}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
              onClick={() => {
                setBusy(true)
                setError(null)
                void requestBalanceRefund(phone)
                  .then((result) => {
                    setDone({
                      crc: result.refund.crcAmount,
                      phone: result.refund.phoneDisplay ?? phone,
                      message: result.message,
                    })
                    onRefunded()
                  })
                  .catch((err) => setError(readableError(err)))
                  .finally(() => setBusy(false))
              }}
            >
              <ArrowUpRight className="h-4 w-4" />
              {busy ? 'Devolviendo…' : 'Confirmar reembolso'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
