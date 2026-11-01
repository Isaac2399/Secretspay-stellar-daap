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
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSound(window.localStorage.getItem('event-display-sound') === '1')
  }, [])

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
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
    <div className="event-board relative flex h-dvh flex-col overflow-hidden bg-white px-8 py-6 text-neutral-950 sm:px-24 sm:pt-8 2xl:px-32 2xl:py-10">
      <HalloweenScene />
      <header className="relative z-10 mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:mb-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-app-accent sm:text-sm">
            Retiro en barra
          </p>
          <h1 className="mt-2 break-words text-3xl font-semibold sm:text-4xl 2xl:text-6xl">
            {venue?.title ?? 'Evento'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-base text-neutral-500 sm:text-lg 2xl:text-2xl">
            {venue?.pickupLabel ?? 'Barra'}
          </p>
          <button
            type="button"
            className="rounded-full bg-neutral-900/5 px-3 py-1.5 text-xs text-neutral-700 2xl:text-sm"
            onClick={() => {
              if (document.fullscreenElement) {
                void document.exitFullscreen()
                return
              }
              void document.documentElement.requestFullscreen()
            }}
          >
            {fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
          <button
            type="button"
            className="rounded-full bg-neutral-900/5 px-3 py-1.5 text-xs text-neutral-700 2xl:text-sm"
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

      <div className="relative z-10 grid min-h-0 min-w-0 flex-1 gap-8 overflow-hidden lg:grid-cols-2">
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
    <section
      className="relative z-10 mt-6 shrink-0 border-t border-neutral-200 pt-4"
      aria-label="Patrocinadores"
    >
      <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 2xl:text-sm">
        Patrocinadores
      </p>
      <div className="relative mt-3 h-40 sm:h-52 2xl:h-64">
        {sponsors.map((sponsor) => (
          <img
            key={sponsor.id}
            src={sponsor.logo}
            alt={sponsor.name}
            className={`absolute inset-0 m-auto max-h-full max-w-[min(80%,36rem)] bg-white object-contain transition-opacity duration-700 ${
              sponsor.id === featured?.id ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}
      </div>
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
      className="mx-8 h-24 w-64 shrink-0 bg-white object-contain 2xl:mx-10 2xl:h-32 2xl:w-80"
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

function HalloweenScene() {
  return (
    <div className="halloween-scene" aria-hidden>
      <SpiderWeb className="web web-tl" />
      <SpiderWeb className="web web-tr" />
      <div className="spider-line">
        <Spider />
      </div>
      <FlyingBat className="vampire-1" />
      <FlyingBat className="vampire-2" />
      <FlyingBat className="vampire-3" />
    </div>
  )
}

function SpiderWeb({ className }: { className: string }) {
  const spokes = 14
  const rings = 7
  const lines = Array.from({ length: spokes }, (_, index) => {
    const angle = (index / spokes) * Math.PI * 2
    return (
      <line
        key={index}
        x1="0"
        y1="0"
        x2={Math.cos(angle) * 100}
        y2={Math.sin(angle) * 100}
      />
    )
  })
  const ringsPaths = Array.from({ length: rings }, (_, ring) => {
    const radius = ((ring + 1) / rings) * 100
    const points = Array.from({ length: spokes + 1 }, (_, index) => {
      const angle = (index / spokes) * Math.PI * 2
      const wobble = radius * (index % 2 === 0 ? 0.9 : 1)
      return `${Math.cos(angle) * wobble},${Math.sin(angle) * wobble}`
    })
    return <polyline key={ring} points={points.join(' ')} />
  })

  return (
    <svg className={className} viewBox="-110 -110 220 220">
      <g fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round">
        {lines}
        {ringsPaths}
      </g>
    </svg>
  )
}

function Spider() {
  return (
    <svg viewBox="0 0 40 36" className="spider-bug">
      <ellipse cx="20" cy="22" rx="7" ry="8" fill="#1a1020" />
      <circle cx="20" cy="12" r="5.5" fill="#1a1020" />
      <circle cx="17.6" cy="11.2" r="0.9" fill="#ff3b1f" />
      <circle cx="22.4" cy="11.2" r="0.9" fill="#ff3b1f" />
      <path d="M13 18 C4 12 1 8 0 4" fill="none" stroke="#1a1020" strokeWidth="1.4" />
      <path d="M13 22 C3 20 1 18 0 14" fill="none" stroke="#1a1020" strokeWidth="1.4" />
      <path d="M14 26 C5 30 2 34 1 36" fill="none" stroke="#1a1020" strokeWidth="1.4" />
      <path d="M27 18 C36 12 39 8 40 4" fill="none" stroke="#1a1020" strokeWidth="1.4" />
      <path d="M27 22 C37 20 39 18 40 14" fill="none" stroke="#1a1020" strokeWidth="1.4" />
      <path d="M26 26 C35 30 38 34 39 36" fill="none" stroke="#1a1020" strokeWidth="1.4" />
    </svg>
  )
}

function Bat() {
  return <img src="/halloween-bat.png" alt="" className="h-full w-full object-contain" />
}

type BatFlight = {
  x0: number
  y0: number
  x1: number
  y1: number
  cx1: number
  cy1: number
  cx2: number
  cy2: number
  duration: number
  waves: number
  amp: number
}

function curve(t: number, a: number, b: number, c: number, d: number) {
  const u = 1 - t
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
}

function nextFlight(): BatFlight {
  const width = window.innerWidth
  const height = window.innerHeight
  const fromLeft = Math.random() < 0.5
  const lane = () => height * (0.04 + Math.random() * 0.78)
  return {
    x0: fromLeft ? -200 : width + 80,
    x1: fromLeft ? width + 80 : -200,
    y0: lane(),
    y1: lane(),
    cx1: width * (0.12 + Math.random() * 0.28),
    cx2: width * (0.48 + Math.random() * 0.35),
    cy1: lane(),
    cy2: lane(),
    duration: 7000 + Math.random() * 9000,
    waves: 1 + Math.floor(Math.random() * 3),
    amp: 18 + Math.random() * 46,
  }
}

function FlyingBat({ className }: { className: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      node.style.transform = `translate3d(${window.innerWidth * 0.3}px, ${window.innerHeight * 0.25}px, 0)`
      return
    }

    let frame = 0
    let flight = nextFlight()
    let start = performance.now() - Math.random() * flight.duration

    const tick = (now: number) => {
      let t = (now - start) / flight.duration
      if (t >= 1) {
        flight = nextFlight()
        start = now
        t = 0
      }
      const x = curve(t, flight.x0, flight.cx1, flight.cx2, flight.x1)
      const y =
        curve(t, flight.y0, flight.cy1, flight.cy2, flight.y1) +
        Math.sin(t * Math.PI * flight.waves) * flight.amp
      const tilt = Math.sin(t * Math.PI * flight.waves) * 10
      node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg)`
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={ref} className={`vampire ${className}`}>
      <Bat />
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
    <section className="event-column relative z-10 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto">
      <h2
        className={`mb-4 text-2xl font-semibold 2xl:text-4xl ${
          tone === 'ready' ? 'text-app-accent' : 'text-neutral-700'
        }`}
      >
        {title}
      </h2>
      {orders.length === 0 ? (
        <p className="text-neutral-400 2xl:text-xl">Nada por ahora</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {orders.map((order) => (
            <div
              key={`${order.status}-${order.orderNumber}-${order.createdAt}`}
              className={`relative z-10 rounded-3xl border px-3 py-5 text-center sm:px-4 sm:py-6 ${
                tone === 'ready'
                  ? 'border-app-accent/30 bg-[#e7f6ef]'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl 2xl:text-6xl">
                #{order.orderNumber}
              </p>
              <p className="mt-2 truncate text-sm text-neutral-500 2xl:text-base">
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
