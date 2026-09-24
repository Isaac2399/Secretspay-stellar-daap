import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

export function ErrorModal({
  message,
  onClose,
  title = 'No se pudo completar',
}: {
  message: string | null
  onClose?: () => void
  title?: string
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
      aria-labelledby="app-error-title"
      aria-describedby="app-error-message"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-[28px] border border-red-500/40 bg-[#1a1010] p-6 shadow-[0_0_40px_rgba(239,68,68,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-500/15 ring-2 ring-red-500/50">
          <AlertTriangle className="h-8 w-8 text-red-400" strokeWidth={2.2} />
        </div>
        <h2
          id="app-error-title"
          className="mt-4 text-center text-xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        <p
          id="app-error-message"
          className="mt-3 text-center text-[15px] leading-relaxed text-white/85"
        >
          {message}
        </p>
        <button
          type="button"
          className="mt-6 w-full rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white"
          onClick={close}
        >
          Entendido
        </button>
      </div>
    </div>
  )
}
