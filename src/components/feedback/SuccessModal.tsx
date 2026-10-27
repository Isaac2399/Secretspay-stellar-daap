import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

export function SuccessModal({
  message,
  onClose,
  title = 'Entregado',
  detail,
}: {
  message: string | null
  onClose?: () => void
  title?: string
  detail?: string | null
}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
  }, [message])

  if (!message || hidden) {
    return null
  }

  function close() {
    setHidden(true)
    onClose?.()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-success-title"
      aria-describedby="app-success-message"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-emerald-500/40 bg-[#0f1a14] p-6 shadow-[0_0_40px_rgba(16,185,129,0.3)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/50">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" strokeWidth={2.2} />
        </div>
        <h2
          id="app-success-title"
          className="mt-4 text-center text-xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        <p
          id="app-success-message"
          className="mt-3 text-center text-[15px] leading-relaxed text-white/85"
        >
          {message}
        </p>
        {detail ? (
          <p className="mt-2 text-center text-sm text-white/60">{detail}</p>
        ) : null}
        <button
          type="button"
          className="mt-6 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-semibold text-white"
          onClick={close}
        >
          Listo
        </button>
      </div>
    </div>
  )
}
