import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Banknote } from 'lucide-react'
import { UnassignedDepositsPanel } from '@/components/admin/UnassignedDepositsPanel'
import {
  searchAdminUsers,
  type AssignableUser,
} from '@/lib/sinpe/api'
import {
  creditCash,
  fetchCashCredits,
  previewRojos,
  type CashCredit,
} from '@/lib/cash/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { shortenPublicKey } from '@/lib/userDisplay'

export function CashierDashboard() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [selected, setSelected] = useState<AssignableUser | null>(null)
  const [crc, setCrc] = useState('')
  const [credits, setCredits] = useState<CashCredit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)

  const crcAmount = Number(crc.replace(/,/g, '.'))
  const preview = previewRojos(crcAmount)

  async function reloadCredits() {
    const result = await fetchCashCredits()
    setCredits(result.credits)
  }

  useEffect(() => {
    let cancelled = false
    void searchAdminUsers('')
      .then((result) => {
        if (!cancelled) {
          setUsers(result.users)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingUsers(false)
        }
      })
    void reloadCredits().catch((err) => {
      if (!cancelled) {
        setError(readableError(err))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Día del evento
        </p>
        <h1 className="mt-1 text-xl font-semibold">Caja en efectivo</h1>
        <p className="mt-1 text-sm text-app-muted">
          Recibe colones, busca la cuenta y acredita ROJOS. Paridad ₡1,000 = 1
          ROJO. Promo ₡9,000 = 10 ROJOS.
        </p>
      </div>

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-sm font-semibold">Buscar cuenta</h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setLoadingUsers(true)
            void searchAdminUsers(query)
              .then((result) => {
                setUsers(result.users)
                setError(null)
              })
              .catch((err) => setError(readableError(err)))
              .finally(() => setLoadingUsers(false))
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, código SINPE o public key"
            className="min-w-0 flex-1 rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
          />
          <button type="submit" className="rounded-2xl bg-app-chip px-3 py-2 text-sm">
            Buscar
          </button>
        </form>
        {loadingUsers ? <p className="text-sm text-app-muted">Buscando…</p> : null}
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => setSelected(user)}
                className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${
                  selected?.id === user.id ? 'bg-app-accent' : 'bg-app-chip'
                }`}
              >
                <span className="block font-medium">{user.email}</span>
                {user.sinpeCode ? (
                  <span className="font-mono text-[11px]">{user.sinpeCode}</span>
                ) : null}
                <span className="ml-2 font-mono text-[11px] text-white/70">
                  {shortenPublicKey(user.publicKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <p className="text-xs text-app-muted">
            Destino: <span className="text-white">{selected.email}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] bg-app-card p-4">
        <h2 className="text-sm font-semibold">Monto recibido</h2>
        <label className="block text-xs text-app-muted">Colones (CRC)</label>
        <input
          value={crc}
          onChange={(event) => setCrc(event.target.value)}
          inputMode="decimal"
          placeholder="9000"
          className="w-full rounded-2xl bg-app-chip px-3 py-3 text-sm outline-none"
        />
        {preview.rojos > 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <Banknote className="h-4 w-4 text-app-accent" />
            Se acreditarán {formatAmount(String(preview.rojos))} ROJOS
            {preview.promoApplied ? (
              <span className="text-[11px] text-app-accent">promo</span>
            ) : null}
          </p>
        ) : null}
        {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
        {message ? <p className="text-sm text-green-400">{message}</p> : null}
        <button
          type="button"
          disabled={!selected || preview.rojos <= 0 || busy}
          className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            if (!selected) {
              return
            }
            setBusy(true)
            setError(null)
            setMessage(null)
            void creditCash({ userId: selected.id, crcAmount })
              .then((result) => {
                setMessage(result.message)
                setCrc('')
                return reloadCredits()
              })
              .catch((err) => setError(readableError(err)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Acreditando…' : 'Confirmar recarga en efectivo'}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Recargas recientes</h2>
        {credits.length === 0 ? (
          <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
            Todavía no hay recargas de caja.
          </p>
        ) : null}
        <ul className="space-y-2">
          {credits.map((row) => (
            <li key={row.id} className="rounded-[24px] bg-app-card p-4">
              <p className="text-xs text-app-muted">
                {new Date(row.createdAt).toLocaleString()}
              </p>
              <p className="mt-1 text-sm font-semibold">
                ₡{row.crcAmount.toLocaleString('es-CR', { maximumFractionDigits: 2 })}{' '}
                → {formatAmount(String(row.calculatedRojos))} ROJOS
                {row.promoApplied ? (
                  <span className="ml-2 text-[11px] text-app-accent">promo</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs text-white/80">{row.email}</p>
              {row.stellarHash ? (
                <p className="mt-1 break-all font-mono text-[11px] text-white/55">
                  {row.stellarHash}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <UnassignedDepositsPanel />
    </div>
  )
}
