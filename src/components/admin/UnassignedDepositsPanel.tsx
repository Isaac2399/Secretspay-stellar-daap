import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import {
  assignDeposit,
  fetchUnassignedDeposits,
  lookupSinpeClaim,
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
  const [manualOpen, setManualOpen] = useState(false)

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

  const claims = deposits.filter((row) => row.status === 'PENDING_USER_CLAIM')
  const unmatched = deposits.filter((row) => row.status === 'PENDING_MANUAL_MATCH')

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Depósitos y reclamos SINPE</h2>
        <p className="mt-1 text-xs text-app-muted">
          Si el SMS tarda, el cliente puede mandar el número de referencia. Acá
          ves esos reclamos y los SMS sin cuenta. Si otorgás a mano con ese
          número, queda marcado y no se entrega otra vez automático.
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
      <button
        type="button"
        className="w-full rounded-2xl bg-app-chip py-2 text-sm font-medium"
        onClick={() => setManualOpen(true)}
      >
        Otorgar ROJOS por número de referencia
      </button>
      {loading ? <p className="text-sm text-app-muted">Cargando…</p> : null}
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
      {deposits.length === 0 && !loading ? (
        <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
          No hay depósitos ni reclamos pendientes.
        </p>
      ) : null}

      {claims.length > 0 ? (
        <DepositGroup
          title="Reclamos por referencia"
          hint="El cliente envió el número porque el SMS no llegó o no se emparejó."
          rows={claims}
          onAssign={setAssigning}
        />
      ) : null}
      {unmatched.length > 0 ? (
        <DepositGroup
          title="SMS sin cuenta"
          hint="Llegó el mensaje pero no hay código sc…ts válido."
          rows={unmatched}
          onAssign={setAssigning}
        />
      ) : null}
      {query.trim() && deposits.some((row) => !isPending(row.status)) ? (
        <DepositGroup
          title="Resultados ya resueltos"
          hint="Incluye otorgados a mano: ese número confirma que ya se dio."
          rows={deposits.filter((row) => !isPending(row.status))}
          onAssign={setAssigning}
        />
      ) : null}

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
      {manualOpen ? (
        <ManualGrantModal
          onClose={() => setManualOpen(false)}
          onAssigned={() => {
            setManualOpen(false)
            void reload()
          }}
        />
      ) : null}
    </section>
  )
}

function DepositGroup({
  title,
  hint,
  rows,
  onAssign,
}: {
  title: string
  hint: string
  rows: UnassignedDeposit[]
  onAssign: (row: UnassignedDeposit) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-[11px] text-app-muted">{hint}</p>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-[24px] bg-app-card p-4">
            <p className="text-xs text-app-muted">
              {new Date(row.timestamp || row.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 text-sm font-semibold">
              ₡
              {row.crcAmount.toLocaleString('es-CR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              → {formatAmount(String(row.calculatedRojos))} ROJOS
              {row.promoApplied ? (
                <span className="ml-2 text-[11px] text-app-accent">promo</span>
              ) : null}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/70">
              Comprobante {row.referenceId}
            </p>
            {row.assignedPublicKey ? (
              <p className="mt-1 font-mono text-[11px] text-app-accent">
                Cuenta {shortenPublicKey(row.assignedPublicKey)}
              </p>
            ) : null}
            <p className="mt-1 break-all text-xs text-white/80">
              Nota: {row.comment || '—'}
            </p>
            {row.rawMessage ? (
              <p className="mt-1 break-all text-[11px] text-white/55">
                SMS: {row.rawMessage}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] uppercase tracking-wide text-app-muted">
              {statusLabel(row)}
            </p>
            {row.lastError ? (
              <p className="mt-1 text-xs text-red-400">{row.lastError}</p>
            ) : null}
            {row.resolvedByAdminId ? (
              <p className="mt-1 text-xs text-app-accent">
                Otorgado manualmente · no se reentrega automático
              </p>
            ) : null}
            {isPending(row.status) ? (
              <button
                type="button"
                className="mt-3 w-full rounded-2xl bg-app-accent py-2 text-sm font-medium"
                onClick={() => onAssign(row)}
              >
                Asignar manualmente
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
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
  const [suggested, setSuggested] = useState<AssignableUser | null>(null)
  const [matchedCode, setMatchedCode] = useState<string | undefined>()
  const [crc, setCrc] = useState(
    deposit.crcAmount > 0 ? String(deposit.crcAmount) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([
      searchAdminUsers(''),
      lookupSinpeClaim(deposit.referenceId).catch(() => null),
    ])
      .then(([search, lookup]) => {
        const suggestion = lookup?.suggestedUser ?? null
        setSuggested(suggestion)
        setMatchedCode(lookup?.matchedCode)
        setUsers(mergeSuggestedFirst(search.users, suggestion))
        if (suggestion) {
          setSelected(suggestion)
        }
      })
      .catch((err) => setError(readableError(err)))
  }, [deposit.referenceId])

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
        <p className="mt-1 text-[11px] text-white/60">
          Al confirmar, este número queda marcado como otorgado a mano y el SMS
          posterior no vuelve a acreditar.
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
        <UserPicker
          query={query}
          setQuery={setQuery}
          users={users}
          setUsers={setUsers}
          selected={selected}
          setSelected={setSelected}
          setError={setError}
          suggestedUserId={suggested?.id}
          matchedCode={matchedCode}
        />
        {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
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

function ManualGrantModal({
  onClose,
  onAssigned,
}: {
  onClose: () => void
  onAssigned: () => void
}) {
  const [referenceId, setReferenceId] = useState('')
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [selected, setSelected] = useState<AssignableUser | null>(null)
  const [suggested, setSuggested] = useState<AssignableUser | null>(null)
  const [matchedCode, setMatchedCode] = useState<string | undefined>()
  const [rojos, setRojos] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void searchAdminUsers('')
      .then((result) => setUsers(result.users))
      .catch((err) => setError(readableError(err)))
  }, [])

  useEffect(() => {
    const reference = referenceId.trim()
    if (reference.length < 4) {
      setSuggested(null)
      setMatchedCode(undefined)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void lookupSinpeClaim(reference)
        .then((lookup) => {
          if (cancelled) {
            return
          }
          const suggestion = lookup.suggestedUser ?? null
          setSuggested(suggestion)
          setMatchedCode(lookup.matchedCode)
          if (suggestion) {
            setUsers((prev) => mergeSuggestedFirst(prev, suggestion))
            setSelected(suggestion)
            setRojos((current) =>
              current.trim()
                ? current
                : lookup.deposit && lookup.deposit.calculatedRojos > 0
                  ? String(lookup.deposit.calculatedRojos)
                  : current,
            )
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggested(null)
            setMatchedCode(undefined)
          }
        })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [referenceId])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-[28px] bg-app-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Otorgar ROJOS por referencia</h3>
          <button type="button" className="text-sm text-app-muted" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <p className="text-xs text-app-muted">
          Podés dar ROJOS con un número de comprobante aunque no haya llegado
          reclamo ni SMS. Ese número queda marcado para no acreditarlo otra vez.
        </p>
        <label className="mt-3 block text-xs text-app-muted">Número de referencia</label>
        <input
          value={referenceId}
          onChange={(event) => setReferenceId(event.target.value)}
          placeholder="12345678"
          className="mt-1 w-full rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <label className="mt-3 block text-xs text-app-muted">ROJOS a otorgar</label>
        <input
          value={rojos}
          onChange={(event) => setRojos(event.target.value)}
          inputMode="decimal"
          placeholder="Ej. 10"
          className="mt-1 w-full rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <UserPicker
          query={query}
          setQuery={setQuery}
          users={users}
          setUsers={setUsers}
          selected={selected}
          setSelected={setSelected}
          setError={setError}
          suggestedUserId={suggested?.id}
          matchedCode={matchedCode}
        />
        {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
        <button
          type="button"
          disabled={
            !selected ||
            busy ||
            !referenceId.trim() ||
            !(Number(rojos.replace(/,/g, '.')) > 0)
          }
          className="mt-4 w-full rounded-2xl bg-app-accent py-3 text-sm font-medium disabled:opacity-40"
          onClick={() => {
            if (!selected) {
              return
            }
            setBusy(true)
            void assignDeposit({
              referenceId: referenceId.trim(),
              userId: selected.id,
              rojosAmount: Number(rojos.replace(/,/g, '.')),
            })
              .then(onAssigned)
              .catch((err) => {
                setError(readableError(err))
                setBusy(false)
              })
          }}
        >
          {busy ? 'Acreditando…' : 'Confirmar otorgamiento'}
        </button>
      </div>
    </div>
  )
}

function UserPicker({
  query,
  setQuery,
  users,
  setUsers,
  selected,
  setSelected,
  setError,
  suggestedUserId,
  matchedCode,
}: {
  query: string
  setQuery: (value: string) => void
  users: AssignableUser[]
  setUsers: (users: AssignableUser[]) => void
  selected: AssignableUser | null
  setSelected: (user: AssignableUser | null) => void
  setError: (value: string | null) => void
  suggestedUserId?: string
  matchedCode?: string
}) {
  const ordered = suggestedUserId
    ? mergeSuggestedFirst(
        users,
        users.find((user) => user.id === suggestedUserId) ?? null,
      )
    : users

  return (
    <>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void searchAdminUsers(query)
            .then((result) => {
              const suggestion =
                users.find((user) => user.id === suggestedUserId) ?? null
              setUsers(mergeSuggestedFirst(result.users, suggestion))
            })
            .catch((err) => setError(readableError(err)))
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar email, código o public key"
          className="min-w-0 flex-1 rounded-2xl bg-app-chip px-3 py-2 text-sm outline-none"
        />
        <button type="submit" className="rounded-2xl bg-app-chip px-3 py-2 text-sm">
          Buscar
        </button>
      </form>
      {suggestedUserId ? (
        <p className="mt-2 text-[11px] text-app-accent">
          Sugerencia al inicio
          {matchedCode ? ` por código ${matchedCode}` : ' por este comprobante'}.
        </p>
      ) : null}
      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto">
        {ordered.map((user) => {
          const isSuggested = user.id === suggestedUserId
          return (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => setSelected(user)}
                className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${
                  selected?.id === user.id ? 'bg-app-accent' : 'bg-app-chip'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="block font-medium">{user.email}</span>
                  {isSuggested ? (
                    <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      Sugerido
                    </span>
                  ) : null}
                </span>
                {matchedCode && isSuggested ? (
                  <span className="block font-mono text-[11px] text-app-accent">
                    {matchedCode}
                  </span>
                ) : user.sinpeCode ? (
                  <span className="block font-mono text-[11px] text-app-accent">
                    {user.sinpeCode}
                  </span>
                ) : null}
                <span className="font-mono text-[11px] text-white/70">
                  {shortenPublicKey(user.publicKey)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function mergeSuggestedFirst(
  users: AssignableUser[],
  suggestion: AssignableUser | null,
) {
  if (!suggestion) {
    return users
  }
  const rest = users.filter((user) => user.id !== suggestion.id)
  return [suggestion, ...rest]
}

function isPending(status: UnassignedDeposit['status']) {
  return status === 'PENDING_MANUAL_MATCH' || status === 'PENDING_USER_CLAIM'
}

function statusLabel(row: UnassignedDeposit) {
  if (row.status === 'PENDING_USER_CLAIM') {
    return 'Reclamo pendiente'
  }
  if (row.status === 'RESOLVED' && row.resolvedByAdminId) {
    return 'Otorgado manualmente'
  }
  if (row.status === 'RESOLVED_BY_USER_CLAIM') {
    return 'Reclamado por el cliente'
  }
  return row.status
}
