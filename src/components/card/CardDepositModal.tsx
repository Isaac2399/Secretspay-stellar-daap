import { CreditCard, X } from 'lucide-react'
import { Sep24DepositPanel } from '@/components/sep24/Sep24DepositPanel'
import type { Sep24Transaction } from '@/lib/sep24/types'

type CardDepositModalProps = {
  hasUsdcTrustline: boolean
  onClose: () => void
  onDepositCompleted?: (tx: Sep24Transaction) => void
}

export function CardDepositModal({
  hasUsdcTrustline,
  onClose,
  onDepositCompleted,
}: CardDepositModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-deposit-title"
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-app-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-app-accent" />
            <h2 id="card-deposit-title" className="text-lg font-semibold">
              Depositar con tarjeta
            </h2>
          </div>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-app-chip"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Sep24DepositPanel
          rail="card"
          hasUsdcTrustline={hasUsdcTrustline}
          onCompleted={onDepositCompleted}
        />
      </div>
    </div>
  )
}
