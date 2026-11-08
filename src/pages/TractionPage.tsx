import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Networks } from '@stellar/stellar-sdk'
import { stellarConfig } from '@/lib/stellar/config'

type Payment = {
  createdAt: string
  merchantName: string
  orderNumber: string
  total: string
  fee: string
  net: string
  feeBps: number
  hash: string
  network: 'testnet' | 'public'
}

type Snapshot = {
  network: 'testnet' | 'public'
  contractId: string
  payments: Payment[]
  waitlistCount: number
  venueNote: string | null
  nextCut?: {
    network: 'public'
    assetCode: string
    issuer: string
    feeBps: number
    contractId: string | null
    status: 'pendiente' | 'contrato'
    note: string
  }
  asOf: string
}

export default function TractionPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [eventName, setEventName] = useState('')
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/traction')
      .then(async (response) => {
        const body = (await response.json()) as Snapshot & { error?: string }
        if (!response.ok) {
          throw new Error(body.error || 'No se pudo cargar la prueba')
        }
        return body
      })
      .then((body) => {
        if (!cancelled) {
          setSnapshot(body)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la prueba')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const response = await fetch('/api/traction/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, event: eventName }),
      })
      const body = (await response.json()) as { count?: number; error?: string }
      if (!response.ok) {
        throw new Error(body.error || 'No se pudo guardar')
      }
      setJoined(body.count ?? 0)
      setSnapshot((current) =>
        current ? { ...current, waitlistCount: body.count ?? current.waitlistCount } : current,
      )
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const network =
    snapshot?.network ??
    (stellarConfig.networkPassphrase === Networks.PUBLIC ? 'public' : 'testnet')

  return (
    <main className="mx-auto min-h-dvh max-w-lg space-y-6 px-4 py-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">PartyPay</p>
        <h1 className="mt-1 text-2xl font-semibold">Prueba de uso</h1>
        <p className="mt-2 text-sm leading-relaxed text-app-muted">
          Cada fila es un pedido cobrado por el contrato, con su transacción. Un número sin
          enlace no cuenta.
        </p>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-base font-semibold">Pedidos</h2>
        {!snapshot ? (
          <p className="text-sm text-app-muted">Cargando…</p>
        ) : snapshot.payments.length === 0 ? (
          <p className="text-sm leading-relaxed text-app-muted">
            Todavía no hay pedidos con transacción en este servidor. Aparecen solos cuando
            alguien paga en la barra.
          </p>
        ) : (
          <ul className="space-y-3">
            {snapshot.payments.map((payment) => (
              <li key={payment.hash} className="border-t border-white/10 pt-3 first:border-0 first:pt-0">
                <p className="text-sm font-medium">
                  #{payment.orderNumber} · {payment.merchantName}
                </p>
                <p className="mt-1 text-sm text-app-muted">
                  Pagó {payment.total} · barra {payment.net} · PartyPay {payment.fee}
                  {payment.feeBps ? ` (${payment.feeBps / 100}%)` : ''}
                </p>
                <p className="mt-1 text-xs text-app-muted">
                  {formatWhen(payment.createdAt)} · {payment.network === 'public' ? 'mainnet' : 'red de pruebas'}
                </p>
                <a
                  href={expertTx(payment.hash, payment.network)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-sm font-medium text-app-accent"
                >
                  {payment.hash}
                </a>
              </li>
            ))}
          </ul>
        )}
        {snapshot?.contractId ? (
          <a
            href={`https://stellar.expert/explorer/${network}/contract/${snapshot.contractId}`}
            target="_blank"
            rel="noreferrer"
            className="block text-sm font-medium text-app-accent"
          >
            Contrato del cobro
          </a>
        ) : null}
      </section>

      <section className="space-y-2 rounded-[24px] bg-app-card p-4">
        <h2 className="text-base font-semibold">Siguiente corte</h2>
        <p className="text-sm leading-relaxed text-app-muted">
          {snapshot?.nextCut?.note ??
            'El 14 y el 21 de noviembre siguen en testnet. El evento siguiente es mainnet, pagado por el Instaward. Sin hash de esa red, no está hecho.'}
        </p>
        <p className="text-sm">
          Comisión {snapshot?.nextCut ? snapshot.nextCut.feeBps / 100 : 2.5} %. El invitado no
          paga la red.
        </p>
        {snapshot?.nextCut?.contractId ? (
          <a
            href={`https://stellar.expert/explorer/public/contract/${snapshot.nextCut.contractId}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-medium text-app-accent"
          >
            Contrato en la red pública
          </a>
        ) : (
          <p className="text-sm leading-relaxed">
            Estado: pendiente. Todavía no hay contrato ni hash en la red pública.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-[24px] bg-app-card p-4">
        <h2 className="text-base font-semibold">Venue</h2>
        {snapshot?.venueNote ? (
          <p className="text-sm leading-relaxed">{snapshot.venueNote}</p>
        ) : (
          <p className="text-sm leading-relaxed text-app-muted">
            Falta la confirmación del venue. Cuando exista un mensaje con fecha, se publica
            aquí. Hasta entonces esta casilla no es evidencia.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-base font-semibold">Lista de espera</h2>
        <p className="text-sm text-app-muted">
          {snapshot ? `${snapshot.waitlistCount} personas dejaron contacto.` : 'Cargando…'} Los
          contactos no se publican.
        </p>
        {joined != null ? (
          <p className="text-sm">Quedaste en la lista. Van {joined}.</p>
        ) : (
          <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
            <label className="grid gap-1 text-sm">
              Nombre
              <input
                className="rounded-2xl bg-app-chip px-3 py-3 outline-none"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Teléfono o email
              <input
                className="rounded-2xl bg-app-chip px-3 py-3 outline-none"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Evento
              <input
                className="rounded-2xl bg-app-chip px-3 py-3 outline-none"
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
                placeholder="Opcional"
              />
            </label>
            {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-app-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Guardando…' : 'Quiero probarlo'}
            </button>
          </form>
        )}
      </section>

      <p className="text-center text-sm">
        <Link to="/login" className="font-medium text-app-accent">
          Volver
        </Link>
      </p>
    </main>
  )
}

function expertTx(hash: string, network: 'testnet' | 'public'): string {
  return `https://stellar.expert/explorer/${network}/tx/${hash}`
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('es-CR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
