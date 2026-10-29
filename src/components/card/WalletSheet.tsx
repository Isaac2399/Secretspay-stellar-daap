import type { ReactNode } from 'react'
import { Smartphone, X } from 'lucide-react'

export function WalletSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 sm:place-items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="wallet-sheet-title"
        className="w-full max-w-md rounded-[28px] bg-app-elevated p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-app-accent">
              Sandbox
            </p>
            <h2 id="wallet-sheet-title" className="mt-1 text-lg font-semibold">
              Agregar a Apple Wallet / Google Pay
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-app-chip"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-sm text-app-muted">
          En producción este botón tokeniza la Visa con el emisor (Rain Cards u
          otro BaaS). Aquí solo mostramos el flujo visual; no se envía la
          tarjeta a Apple ni a Google.
        </p>
        <div className="mt-4 grid gap-2">
          <FakeWalletRow icon={<AppleMark className="h-5 w-5" />} label="Apple Wallet" />
          <FakeWalletRow
            icon={<Smartphone className="h-5 w-5" />}
            label="Google Pay"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium text-black"
        >
          Entendido
        </button>
      </div>
    </div>
  )
}

function AppleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.2 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-.1 2.9-2.2c1.1-1.5 1.5-3 1.5-3.1-.1 0-2.8-1.1-2.8-4zM14.8 5.8c.6-.8 1.1-1.9.9-3-1 .1-2.1.7-2.8 1.5-.6.7-1.1 1.8-.9 2.9 1.1.1 2.2-.5 2.8-1.4z" />
    </svg>
  )
}

function FakeWalletRow({
  icon,
  label,
}: {
  icon: ReactNode
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-app-card px-4 py-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-app-muted">Disponible con credenciales reales</p>
      </div>
      <span className="text-xs text-white/40">Mock</span>
    </div>
  )
}
