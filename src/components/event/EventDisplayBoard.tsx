import { useEffect, useRef, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fetchEventBoard, fetchScreenAsset } from '@/lib/events/api'
import type {
  EventBoardOrder,
  EventBoardScreen,
  EventScreenPlayback,
  EventSponsorLogo,
  EventVenue,
} from '@/types/event'

const EMPTY_SCREEN: EventBoardScreen = { sponsors: [], playback: null }

export function EventDisplayBoard({ merchantId }: { merchantId: string }) {
  const [venue, setVenue] = useState<EventVenue | null>(null)
  const [preparing, setPreparing] = useState<EventBoardOrder[]>([])
  const [ready, setReady] = useState<EventBoardOrder[]>([])
  const [screen, setScreen] = useState<EventBoardScreen>(EMPTY_SCREEN)
  const [asset, setAsset] = useState<{
    id: string
    title: string
    kind: 'image' | 'video'
    src: string
  } | null>(null)
  const [sound, setSound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSound(window.localStorage.getItem('event-display-sound') === '1')
  }, [])

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
        const next = board.screen ?? EMPTY_SCREEN
        setScreen((current) => (sameScreen(current, next) ? current : next))
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la pantalla')
        }
      }
    }

    void load()
    const id = window.setInterval(() => void load(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [merchantId])

  const playback = screen.playback

  useEffect(() => {
    if (!playback) {
      return
    }
    let cancelled = false
    void fetchScreenAsset(merchantId, playback.id)
      .then((next) => {
        if (!cancelled) {
          setAsset(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAsset(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [merchantId, playback])

  const live = playback && asset && asset.id === playback.id ? asset : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black px-4 py-6 text-white sm:px-8 2xl:px-12 2xl:py-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-app-accent sm:text-sm">
            Retiro en barra
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl 2xl:text-6xl">
            {venue?.title ?? 'Evento'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-base text-app-muted sm:text-lg 2xl:text-2xl">
            {venue?.pickupLabel ?? 'Barra'}
          </p>
          <button
            type="button"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 2xl:text-sm"
            onClick={() => {
              setSound((current) => {
                const next = !current
                window.localStorage.setItem('event-display-sound', next ? '1' : '0')
                return next
              })
            }}
          >
            {sound ? 'Sonido activo' : 'Activar sonido'}
          </button>
        </div>
      </header>

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      <div className="grid min-h-0 min-w-0 flex-1 gap-8 overflow-hidden lg:grid-cols-2">
        <BoardColumn title="Preparando" orders={preparing} tone="muted" />
        <BoardColumn title="Listos" orders={ready} tone="ready" />
      </div>

      {screen.sponsors.length > 0 ? <SponsorBand sponsors={screen.sponsors} /> : null}

      {playback ? (
        <PlaybackStage
          playback={playback}
          asset={live}
          sound={sound}
          preparing={preparing}
          ready={ready}
        />
      ) : null}
    </div>
  )
}

function SponsorBand({ sponsors }: { sponsors: EventSponsorLogo[] }) {
  const [index, setIndex] = useState(0)
  const signature = sponsors.map((sponsor) => sponsor.id).join('|')

  useEffect(() => {
    setIndex(0)
  }, [signature])

  useEffect(() => {
    if (sponsors.length < 2) {
      return
    }
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % sponsors.length)
    }, 4500)
    return () => window.clearInterval(id)
  }, [signature, sponsors.length])

  const featured = sponsors[index] ?? sponsors[0]

  return (
    <section className="mt-6 shrink-0 border-t border-white/10 pt-4" aria-label="Patrocinadores">
      <p className="text-xs uppercase tracking-[0.22em] text-white/45 2xl:text-sm">
        Patrocinadores
      </p>
      <div className="relative mt-3 h-28 sm:h-36 2xl:h-48">
        {sponsors.map((sponsor) => (
          <img
            key={sponsor.id}
            src={sponsor.logo}
            alt={sponsor.name}
            className={`absolute inset-0 m-auto max-h-full max-w-[min(70%,28rem)] object-contain transition-opacity duration-700 ${
              sponsor.id === featured?.id ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
      </div>
      {featured ? (
        <p className="mt-2 text-center text-sm text-white/70 2xl:text-lg">{featured.name}</p>
      ) : null}
      <SponsorMarquee sponsors={sponsors} />
    </section>
  )
}

function SponsorMarquee({ sponsors }: { sponsors: EventSponsorLogo[] }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const sampleRef = useRef<HTMLDivElement>(null)
  const [repeat, setRepeat] = useState(4)
  const [duration, setDuration] = useState(24)
  const signature = sponsors.map((sponsor) => sponsor.id).join('|')

  useEffect(() => {
    const frame = frameRef.current
    const sample = sampleRef.current
    if (!frame || !sample) {
      return
    }

    const fit = () => {
      const sampleWidth = sample.getBoundingClientRect().width
      const frameWidth = frame.clientWidth
      if (sampleWidth < 1 || frameWidth < 1) {
        return
      }
      const nextRepeat = Math.max(1, Math.ceil(frameWidth / sampleWidth))
      const nextDuration = Math.max(16, Math.round((sampleWidth * nextRepeat) / 90))
      setRepeat((current) => (current === nextRepeat ? current : nextRepeat))
      setDuration((current) => (current === nextDuration ? current : nextDuration))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [signature])

  const sequence = Array.from({ length: repeat }, () => sponsors).flat()
  const track = [...sequence, ...sequence]

  return (
    <div
      ref={frameRef}
      className="relative left-1/2 mt-4 w-screen -translate-x-1/2 overflow-hidden"
    >
      <div ref={sampleRef} aria-hidden className="pointer-events-none absolute flex w-max opacity-0">
        {sponsors.map((sponsor) => (
          <SponsorTile key={sponsor.id} sponsor={sponsor} />
        ))}
      </div>
      <div
        className="sponsor-pass flex w-max items-center"
        style={{ animationDuration: `${duration}s` }}
      >
        {track.map((sponsor, position) => (
          <SponsorTile key={`${sponsor.id}-${position}`} sponsor={sponsor} />
        ))}
      </div>
    </div>
  )
}

function SponsorTile({ sponsor }: { sponsor: EventSponsorLogo }) {
  return (
    <img
      src={sponsor.logo}
      alt=""
      className="mx-6 h-14 w-40 shrink-0 object-contain 2xl:mx-8 2xl:h-20 2xl:w-52"
    />
  )
}

function PlaybackStage({
  playback,
  asset,
  sound,
  preparing,
  ready,
}: {
  playback: EventScreenPlayback
  asset: { id: string; kind: 'image' | 'video'; src: string } | null
  sound: boolean
  preparing: EventBoardOrder[]
  ready: EventBoardOrder[]
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black">
      <p className="px-6 pt-5 text-xs uppercase tracking-[0.22em] text-white/50 2xl:text-sm">
        {playback.title}
      </p>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-4">
        {asset?.kind === 'video' ? (
          <ScreenVideo key={asset.id} src={asset.src} sound={sound} />
        ) : asset ? (
          <img src={asset.src} alt={playback.title} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-white/50">Cargando…</p>
        )}
      </div>
      <div className="flex gap-6 overflow-x-auto bg-black/80 px-6 py-4 text-2xl 2xl:text-4xl">
        <span className="shrink-0 text-white/50">Preparando</span>
        {preparing.length === 0 ? (
          <span className="shrink-0 text-white/30">—</span>
        ) : (
          preparing.map((order) => (
            <span key={`p-${order.orderNumber}`} className="shrink-0 tabular-nums">
              #{order.orderNumber}
            </span>
          ))
        )}
        <span className="shrink-0 text-app-accent">Listos</span>
        {ready.length === 0 ? (
          <span className="shrink-0 text-white/30">—</span>
        ) : (
          ready.map((order) => (
            <span key={`r-${order.orderNumber}`} className="shrink-0 tabular-nums text-app-accent">
              #{order.orderNumber}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function ScreenVideo({ src, sound }: { src: string; sound: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const node = videoRef.current
    if (!node) {
      return
    }
    node.muted = !sound
    void node.play().catch(() => {
      node.muted = true
      void node.play().catch(() => undefined)
    })
  }, [src, sound])

  return (
    <video
      ref={videoRef}
      className="max-h-full max-w-full"
      src={src}
      autoPlay
      loop
      playsInline
      muted={!sound}
    />
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
    <section className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
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

function sameScreen(current: EventBoardScreen, next: EventBoardScreen): boolean {
  if (current.sponsors.length !== next.sponsors.length) {
    return false
  }
  for (let i = 0; i < current.sponsors.length; i += 1) {
    if (
      current.sponsors[i]?.id !== next.sponsors[i]?.id ||
      current.sponsors[i]?.name !== next.sponsors[i]?.name ||
      current.sponsors[i]?.logo !== next.sponsors[i]?.logo
    ) {
      return false
    }
  }
  const a = current.playback
  const b = next.playback
  if (!a && !b) {
    return true
  }
  return Boolean(a && b && a.id === b.id && a.until === b.until && a.kind === b.kind)
}
