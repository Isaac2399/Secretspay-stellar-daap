import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fetchEventBoard } from '@/lib/events/api'
import type { EventBoardOrder, EventVenue } from '@/types/event'

export function EventDisplayBoard({ merchantId }: { merchantId: string }) {
  const [venue, setVenue] = useState<EventVenue | null>(null)
  const [preparing, setPreparing] = useState<EventBoardOrder[]>([])
  const [ready, setReady] = useState<EventBoardOrder[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const board = await fetchEventBoard(merchantId)
        if (cancelled) {
          return
        }
        setVenue(board.venue)
        setPreparing(board.preparing)
        setReady(board.ready)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la pantalla')
        }
      }
    }

    void load()
    const id = window.setInterval(() => void load(), 4000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [merchantId])

  return (
    <div className="min-h-dvh bg-black px-4 py-6 text-white sm:px-8 2xl:px-12 2xl:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-8">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-app-accent sm:text-sm">
            Retiro en barra
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl 2xl:text-6xl">
            {venue?.title ?? 'Evento'}
          </h1>
        </div>
        <p className="text-base text-app-muted sm:text-lg 2xl:text-2xl">
          {venue?.pickupLabel ?? 'Barra'}
        </p>
      </header>

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <BoardColumn title="Preparando" orders={preparing} tone="muted" />
        <BoardColumn title="Listos" orders={ready} tone="ready" />
      </div>
    </div>
  )
}

function BoardColumn({
  title,
  orders,
  tone,
}: {
  title: string
  orders: EventBoardOrder[]
  tone: 'muted' | 'ready'
}) {
  return (
    <section>
      <h2
        className={`mb-4 text-2xl font-semibold 2xl:text-4xl ${
          tone === 'ready' ? 'text-app-accent' : 'text-white/80'
        }`}
      >
        {title}
      </h2>
      {orders.length === 0 ? (
        <p className="text-white/40 2xl:text-xl">Nada por ahora</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order) => (
            <div
              key={`${order.status}-${order.orderNumber}-${order.createdAt}`}
              className={`rounded-3xl px-3 py-5 text-center sm:px-4 sm:py-6 ${
                tone === 'ready' ? 'bg-app-accent/20' : 'bg-app-card'
              }`}
            >
              <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl 2xl:text-6xl">
                #{order.orderNumber}
              </p>
              <p className="mt-2 truncate text-sm text-white/70 2xl:text-base">
                {order.pickupLabel}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
