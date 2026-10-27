import { useEffect, useState } from 'react'
import { Networks } from '@stellar/stellar-sdk'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fieldClass } from '@/components/auth/AuthLayout'
import { fetchAdminEvents, saveAdminEvent } from '@/lib/events/api'
import { readableError } from '@/lib/auth/readableError'
import { stellarConfig } from '@/lib/stellar/config'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { shortenPublicKey } from '@/lib/userDisplay'
import type { EventAdminRow } from '@/types/event'

const explorer =
  stellarConfig.networkPassphrase === Networks.PUBLIC ? 'public' : 'testnet'

export function AdminEventsPanel() {
  const [events, setEvents] = useState<EventAdminRow[]>([])
  const [merchantId, setMerchantId] = useState('')
  const [title, setTitle] = useState('')
  const [pickupLabel, setPickupLabel] = useState('Barra')
  const [active, setActive] = useState(true)
  const [feePercent, setFeePercent] = useState('2.5')
  const [feeAccount, setFeeAccount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function reload() {
    const result = await fetchAdminEvents()
    setEvents(result.events)
    return result.events
  }

  useEffect(() => {
    let cancelled = false
    void reload()
      .then((rows) => {
        if (cancelled || rows.length === 0) {
          return
        }
        applyRow(rows[0])
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function applyRow(row: EventAdminRow) {
    setMerchantId(row.merchantId)
    setTitle(row.title)
    setPickupLabel(row.pickupLabel || 'Barra')
    setActive(row.active !== false)
    setFeePercent(row.feePercent || '0')
    setFeeAccount(row.feeAccount)
  }

  async function save() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await saveAdminEvent({
        merchantId,
        title,
        pickupLabel,
        active,
        feePercent,
        feeAccount,
      })
      await reload()
      setMessage(
        active
          ? 'Evento activo. Visible para clientes y con la comisión configurada.'
          : 'Evento inactivo. Ya no aparece en la app de clientes.',
      )
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-[17px] font-semibold">Evento y comisión</h2>
        <p className="text-xs text-app-muted">
          El porcentaje de cada compra se transfiere a la cuenta que indiques.
          El resto queda en la empresa. Puedes revisar aquí todos los eventos.
        </p>
        {loading ? <p className="text-sm text-app-muted">Cargando eventos…</p> : null}
        {!loading && events.length === 0 ? (
          <p className="text-sm text-app-muted">Todavía no hay empresas registradas.</p>
        ) : null}
        {events.length > 0 ? (
          <label className="grid gap-1 text-sm">
            Empresa
            <select
              className={fieldClass}
              value={merchantId}
              onChange={(e) => {
                const row = events.find((item) => item.merchantId === e.target.value)
                if (row) {
                  applyRow(row)
                }
              }}
            >
              {events.map((row) => (
                <option key={row.merchantId} value={row.merchantId}>
                  {row.title} · {row.email}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-sm">
          Nombre del evento
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Punto de retiro
          <input
            className={fieldClass}
            value={pickupLabel}
            onChange={(e) => setPickupLabel(e.target.value)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-app-chip px-3 py-3 text-sm">
          <span>
            Visible para clientes
            <span className="mt-0.5 block text-xs text-app-muted">
              {active ? 'Activo en la app' : 'Oculto / inactivo'}
            </span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--app-accent,#e11d48)]"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Comisión por compra (%)
          <input
            className={fieldClass}
            inputMode="decimal"
            value={feePercent}
            onChange={(e) => setFeePercent(e.target.value)}
            placeholder="2.5"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Cuenta que recibe la comisión
          <input
            className={fieldClass}
            value={feeAccount}
            onChange={(e) => setFeeAccount(e.target.value)}
            placeholder="G…"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="w-full rounded-2xl bg-app-accent py-2.5 text-sm font-medium disabled:opacity-60"
          disabled={busy || !merchantId}
          onClick={() => void save()}
        >
          Guardar evento
        </button>
        {message ? <p className="text-sm text-app-accent">{message}</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Todos los eventos</h2>
        {events.map((row) => (
          <article key={row.merchantId} className="space-y-2 rounded-[24px] bg-app-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{row.title}</h3>
                <p className="text-xs text-app-muted">{row.email}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-medium ${
                    row.active !== false ? 'text-app-accent' : 'text-app-muted'
                  }`}
                >
                  {row.active !== false ? 'Activo' : 'Inactivo'}
                </p>
                <p className="text-xs text-app-muted">
                  {row.feeBps > 0 ? `${row.feePercent}%` : 'Sin comisión'}
                </p>
              </div>
            </div>
            <p className="break-all font-mono text-[11px] text-white/70">
              {row.feeAccount ? shortenPublicKey(row.feeAccount) : 'Sin cuenta de comisión'}
            </p>
            <FeeTotals totals={row.feesCollected} />
            {row.recentFees.length > 0 ? (
              <ul className="space-y-1">
                {row.recentFees.map((fee) => (
                  <li key={`${fee.orderNumber}-${fee.createdAt}`} className="text-[11px] text-white/75">
                    Pedido {fee.orderNumber}: {formatAmount(fee.fee)} {fee.asset}
                    {fee.hash ? (
                      <>
                        {' · '}
                        <a
                          className="underline"
                          href={`https://stellar.expert/explorer/${explorer}/tx/${fee.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Stellar Expert
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-app-muted">Aún no hay comisiones cobradas.</p>
            )}
          </article>
        ))}
      </section>
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
    </div>
  )
}

function FeeTotals({ totals }: { totals: Record<string, string> }) {
  const assets = Object.keys(totals)
  if (assets.length === 0) {
    return null
  }
  return (
    <ul className="space-y-0.5">
      {assets.map((asset) => (
        <li key={asset} className="flex justify-between text-xs tabular-nums">
          <span>Cobrado en {asset}</span>
          <span>{formatAmount(totals[asset] ?? '0')}</span>
        </li>
      ))}
    </ul>
  )
}
