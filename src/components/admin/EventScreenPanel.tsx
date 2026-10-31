import { useEffect, useRef, useState } from 'react'
import { fieldClass } from '@/components/auth/AuthLayout'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { readableError } from '@/lib/auth/readableError'
import { fetchAdminScreen, mutateAdminScreen } from '@/lib/events/api'
import { compressSponsorLogo, prepareScreenClip } from '@/lib/events/screenMedia'
import type { EventScreenLibrary } from '@/types/event'

const DURATIONS: Array<{ id: string; label: string; seconds: number | null }> = [
  { id: 'hold', label: 'Hasta detener', seconds: null },
  { id: '15', label: '15 s', seconds: 15 },
  { id: '30', label: '30 s', seconds: 30 },
  { id: '60', label: '1 min', seconds: 60 },
  { id: '180', label: '3 min', seconds: 180 },
]

export function EventScreenPanel({ merchantId }: { merchantId: string }) {
  const [library, setLibrary] = useState<EventScreenLibrary | null>(null)
  const [sponsorName, setSponsorName] = useState('')
  const [clipTitle, setClipTitle] = useState('')
  const [seconds, setSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState<'logo' | 'clip' | 'run' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void fetchAdminScreen(merchantId)
      .then((next) => {
        if (!cancelled) {
          setLibrary(next)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [merchantId])

  const playbackKey = library?.playback
    ? `${library.playback.id}:${library.playback.until ?? ''}`
    : ''

  useEffect(() => {
    if (!playbackKey) {
      return
    }
    const id = window.setInterval(() => {
      if (busyRef.current) {
        return
      }
      void fetchAdminScreen(merchantId)
        .then((next) => {
          if (!busyRef.current) {
            setLibrary(next)
          }
        })
        .catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(id)
  }, [merchantId, playbackKey])

  async function run(task: () => Promise<EventScreenLibrary>) {
    busyRef.current = true
    setBusy('run')
    try {
      setLibrary(await task())
      setError(null)
    } catch (err) {
      setError(readableError(err))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function onSponsorFile(file: File | undefined) {
    if (!file) {
      return
    }
    const name = sponsorName.trim()
    if (!name) {
      setError('Escribe el nombre del patrocinador antes de subir el logo.')
      return
    }
    busyRef.current = true
    setBusy('logo')
    try {
      const logo = await compressSponsorLogo(file)
      setLibrary(
        await mutateAdminScreen({
          merchantId,
          action: 'add-sponsor',
          name,
          logo,
        }),
      )
      setSponsorName('')
      setError(null)
    } catch (err) {
      setError(readableError(err))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  async function onClipFile(file: File | undefined) {
    if (!file) {
      return
    }
    busyRef.current = true
    setBusy('clip')
    try {
      const prepared = await prepareScreenClip(file)
      setLibrary(
        await mutateAdminScreen({
          merchantId,
          action: 'add-clip',
          title: clipTitle.trim() || prepared.title,
          kind: prepared.kind,
          src: prepared.src,
        }),
      )
      setClipTitle('')
      setError(null)
    } catch (err) {
      setError(readableError(err))
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const playingId = library?.playback?.id ?? null

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Patrocinadores en la TV</h2>
        <p className="text-xs text-app-muted">
          Los logos salen en la pantalla de pedidos, arriba de las bebidas: uno
          grande que se va cambiando y una fila que pasa de lado a lado.
        </p>
        <label className="grid gap-1 text-sm">
          Nombre
          <input
            className={fieldClass}
            value={sponsorName}
            onChange={(event) => setSponsorName(event.target.value)}
            placeholder="Cerveza del sponsor"
          />
        </label>
        <label className="block rounded-2xl bg-app-chip px-4 py-3 text-center text-sm">
          {busy === 'logo' ? 'Subiendo…' : 'Subir logo'}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void onSponsorFile(file)
            }}
          />
        </label>
        <ul className="grid gap-2 sm:grid-cols-2">
          {library?.sponsors.map((sponsor) => (
            <li
              key={sponsor.id}
              className="flex items-center gap-3 rounded-2xl bg-app-chip p-2"
            >
              <img
                src={sponsor.logo}
                alt=""
                className="h-14 w-20 rounded-xl bg-black object-contain"
              />
              <p className="min-w-0 flex-1 truncate text-sm">{sponsor.name}</p>
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-xs text-app-muted"
                disabled={busy !== null}
                onClick={() =>
                  void run(() =>
                    mutateAdminScreen({
                      merchantId,
                      action: 'remove-sponsor',
                      id: sponsor.id,
                    }),
                  )
                }
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
        {library && library.sponsors.length === 0 ? (
          <p className="text-sm text-app-muted">Todavía no hay logos.</p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Reproducir en la TV</h2>
        <p className="text-xs text-app-muted">
          Sube imágenes o videos una vez. Después pulsa Reproducir y la pantalla
          de pedidos los muestra a pantalla completa. El video sale sin sonido
          hasta que alguien toque “Activar sonido” en la TV.
        </p>
        {library?.playback ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-app-accent/20 px-4 py-3">
            <p className="min-w-0 text-sm">
              En pantalla: <span className="font-medium">{library.playback.title}</span>
            </p>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-app-chip px-3 py-2 text-xs"
              disabled={busy !== null}
              onClick={() =>
                void run(() => mutateAdminScreen({ merchantId, action: 'stop' }))
              }
            >
              Detener
            </button>
          </div>
        ) : null}
        <label className="grid gap-1 text-sm">
          Título
          <input
            className={fieldClass}
            value={clipTitle}
            onChange={(event) => setClipTitle(event.target.value)}
            placeholder="Spot del patrocinador"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs ${
                seconds === option.seconds ? 'bg-app-accent' : 'bg-app-chip'
              }`}
              onClick={() => setSeconds(option.seconds)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="block rounded-2xl bg-app-chip px-4 py-3 text-center text-sm">
          {busy === 'clip' ? 'Guardando…' : 'Añadir imagen o video'}
          <input
            className="sr-only"
            type="file"
            accept="image/*,video/mp4,video/webm"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void onClipFile(file)
            }}
          />
        </label>
        <p className="text-xs text-app-muted">Video MP4 o WebM, hasta 8 MB.</p>
        <ul className="space-y-2">
          {library?.clips.map((clip) => {
            const live = clip.id === playingId
            return (
              <li
                key={clip.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 ${
                  live ? 'bg-app-accent/20 ring-1 ring-app-accent' : 'bg-app-chip'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{clip.title}</p>
                  <p className="text-xs text-app-muted">
                    {clip.kind === 'video' ? 'Video' : 'Imagen'}
                    {live ? ' · en la TV' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl bg-app-accent px-3 py-2 text-xs font-medium disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(() =>
                      mutateAdminScreen({
                        merchantId,
                        action: 'play',
                        id: clip.id,
                        seconds,
                      }),
                    )
                  }
                >
                  Reproducir
                </button>
                <button
                  type="button"
                  className="rounded-xl px-3 py-2 text-xs text-app-muted"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(() =>
                      mutateAdminScreen({
                        merchantId,
                        action: 'remove-clip',
                        id: clip.id,
                      }),
                    )
                  }
                >
                  Quitar
                </button>
              </li>
            )
          })}
        </ul>
        {library && library.clips.length === 0 ? (
          <p className="text-sm text-app-muted">Todavía no hay piezas guardadas.</p>
        ) : null}
      </section>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}
