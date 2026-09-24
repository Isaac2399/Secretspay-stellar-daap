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
    <div className="min-h-dvh bg-black px-8 py-6 text-white">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-app-accent">Retiro en barra</p>
          <h1 className="mt-2 text-4xl font-semibold">{venue?.title ?? 'Evento'}</h1>
        </div>
        <p className="text-lg text-app-muted">{venue?.pickupLabel ?? 'Barra'}</p>
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
        className={`mb-4 text-2xl font-semibold ${
          tone === 'ready' ? 'text-app-accent' : 'text-white/80'
        }`}
      >
        {title}
      </h2>
      {orders.length === 0 ? (
        <p className="text-white/40">Nada por ahora</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {orders.map((order) => (
            <div
              key={`${order.status}-${order.orderNumber}-${order.createdAt}`}
              className={`rounded-3xl px-4 py-6 text-center ${
                tone === 'ready' ? 'bg-app-accent/20' : 'bg-app-card'
              }`}
            >
              <p className="text-5xl font-semibold tracking-tight">#{order.orderNumber}</p>
              <p className="mt-2 text-sm text-white/70">{order.pickupLabel}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
