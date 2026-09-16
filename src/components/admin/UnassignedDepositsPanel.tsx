import { useEffect, useState } from 'react'
import {
  assignDeposit,
  fetchUnassignedDeposits,
  searchAdminUsers,
  type AssignableUser,
  type UnassignedDeposit,
} from '@/lib/sinpe/api'
import { readableError } from '@/lib/auth/readableError'
import { formatAmount } from '@/lib/stellar/useAccountBalances'
import { shortenPublicKey } from '@/lib/userDisplay'

export function UnassignedDepositsPanel() {
  const [query, setQuery] = useState('')
  const [deposits, setDeposits] = useState<UnassignedDeposit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [assigning, setAssigning] = useState<UnassignedDeposit | null>(null)

  async function reload(search = query) {
    setLoading(true)
    try {
      const result = await fetchUnassignedDeposits(search)
      setDeposits(result.deposits)
      setError(null)
    } catch (err) {
      setError(readableError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchUnassignedDeposits('')
      .then((result) => {
        if (!cancelled) {
          setDeposits(result.deposits)
          setError(null)
        }
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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Depósitos SINPE sin asignar</h2>
        <p className="mt-1 text-xs text-app-muted">
          Buscá por el SMS completo, el código sc…ts o el comprobante del banco.
          Paridad ₡1,000 = 1 ROJO. Promo ₡9,000 = 10 ROJOS.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void reload(query)
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="SMS, comprobante o código del banco"
          className="min-w-0 flex-1 rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="rounded-2xl bg-app-accent px-3 py-2 text-sm font-medium"
        >
          Buscar
        </button>
      </form>
      {loading ? <p className="text-sm text-app-muted">Cargando…</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {deposits.length === 0 && !loading ? (
        <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
          No hay depósitos pendientes.
        </p>
      ) : null}
      <ul className="space-y-2">
        {deposits.map((row) => (
          <li key={row.id} className="rounded-[24px] bg-app-card p-4">
            <p className="text-xs text-app-muted">
              {new Date(row.timestamp || row.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 text-sm font-semibold">
              ₡{row.crcAmount.toLocaleString('es-CR', { maximumFractionDigits: 2 })} →{' '}
              {formatAmount(String(row.calculatedRojos))} ROJOS
              {row.promoApplied ? (
                <span className="ml-2 text-[11px] text-app-accent">promo</span>
              ) : null}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/70">
              Comprobante {row.referenceId}
            </p>
            <p className="mt-1 break-all text-xs text-white/80">
              Nota: {row.comment || '—'}
            </p>
            {row.rawMessage ? (
              <p className="mt-1 break-all text-[11px] text-white/55">
                SMS: {row.rawMessage}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] uppercase tracking-wide text-app-muted">
              {row.status}
            </p>
            {row.lastError ? (
              <p className="mt-1 text-xs text-red-400">{row.lastError}</p>
            ) : null}
            {row.status === 'PENDING_MANUAL_MATCH' ? (
              <button
                type="button"
                className="mt-3 w-full rounded-2xl bg-app-accent py-2 text-sm font-medium"
                onClick={() => setAssigning(row)}
              >
                Asignar manualmente
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {assigning ? (
        <AssignModal
          deposit={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => {
            setAssigning(null)
            void reload()
          }}
        />
      ) : null}
    </section>
  )
}

function AssignModal({
  deposit,
  onClose,
  onAssigned,
}: {
  deposit: UnassignedDeposit
  onClose: () => void
  onAssigned: () => void
}) {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [selected, setSelected] = useState<AssignableUser | null>(null)
  const [crc, setCrc] = useState(
    deposit.crcAmount > 0 ? String(deposit.crcAmount) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void searchAdminUsers('')
      .then((result) => setUsers(result.users))
      .catch((err) => setError(readableError(err)))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-app-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Asignar recarga</h3>
          <button type="button" className="text-sm text-app-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="text-xs text-app-muted">
          Comprobante {deposit.referenceId}
        </p>
        {deposit.rawMessage ? (
          <p className="mt-2 max-h-28 overflow-y-auto break-all rounded-2xl bg-app-chip px-3 py-2 text-[11px] text-white/70">
            {deposit.rawMessage}
          </p>
        ) : null}
        <label className="mt-3 block text-xs text-app-muted">Monto CRC del SMS</label>
        <input
          value={crc}
          onChange={(event) => setCrc(event.target.value)}
          inputMode="decimal"
          placeholder="Monto en colones"
          className="mt-1 w-full rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void searchAdminUsers(query)
              .then((result) => setUsers(result.users))
              .catch((err) => setError(readableError(err)))
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar email o public key"
            className="min-w-0 flex-1 rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
          />
          <button type="submit" className="rounded-2xl bg-app-chip px-3 py-2 text-sm">
            Buscar
          </button>
        </form>
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
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
                  <span className="font-mono text-[11px] text-app-accent">
                    {user.sinpeCode}
                  </span>
                ) : null}
                <span className="font-mono text-[11px] text-white/70">
                  {shortenPublicKey(user.publicKey)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <button
          type="button"
          disabled={!selected || busy || !(Number(crc.replace(/,/g, '.')) > 0)}
          className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            if (!selected) {
              return
            }
            setBusy(true)
            void assignDeposit({
              referenceId: deposit.referenceId,
              userId: selected.id,
              crcAmount: Number(crc.replace(/,/g, '.')),
            })
              .then(onAssigned)
              .catch((err) => {
                setError(readableError(err))
                setBusy(false)
              })
          }}
        >
          {busy ? 'Acreditando…' : 'Confirmar asignación'}
        </button>
      </div>
    </div>
  )
}
