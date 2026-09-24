import { useEffect, useState, type FormEvent } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { Send } from 'lucide-react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fieldClass } from '@/components/auth/AuthLayout'
import {
  fetchStaffSendSource,
  sendStaffTransfer,
  type StaffSendSource,
} from '@/lib/admin/api'
import { readableError } from '@/lib/auth/readableError'
import { searchAdminUsers, type AssignableUser } from '@/lib/sinpe/api'
import { stellarConfig } from '@/lib/stellar/config'
import { formatAmount, useAccountBalances } from '@/lib/stellar/useAccountBalances'

const ASSETS = [
  { value: stellarConfig.loyalty.code, label: stellarConfig.loyalty.code },
  { value: 'XLM', label: 'XLM' },
  { value: 'USD', label: 'USD' },
] as const

export function StaffSendPanel() {
  const [source, setSource] = useState<StaffSendSource | null>(null)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [destination, setDestination] = useState('')
  const [amount, setAmount] = useState('')
  const [asset, setAsset] = useState<string>(ASSETS[0].value)
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [sentAsset, setSentAsset] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const balances = useAccountBalances(source?.publicKey ?? '')

  useEffect(() => {
    let cancelled = false
    void fetchStaffSendSource()
      .then((next) => {
        if (!cancelled) {
          setSource(next)
          setSourceError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSourceError(readableError(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await searchAdminUsers(query)
    setUsers(result.users)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setHash(null)
    setSentAsset(null)
    const dest = destination.trim()
    if (!StrKey.isValidEd25519PublicKey(dest)) {
      setError('La public key de destino no es válida')
      return
    }
    if (!/^\d+(\.\d{1,7})?$/.test(amount) || Number(amount) <= 0) {
      setError('El monto no es válido')
      return
    }
    setSubmitting(true)
    try {
      const result = await sendStaffTransfer({
        destination: dest,
        amount,
        asset,
        memo: memo.trim(),
      })
      setHash(result.hash)
      setSentAsset(result.asset === 'USDC' ? 'USD' : result.asset)
      setAmount('')
      void balances.reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const balanceLabel =
    asset === 'XLM'
      ? balances.balances.xlm
      : asset === 'USD'
        ? balances.balances.usdc
        : balances.balances.loyalty

  return (
    <section className="space-y-4 rounded-[24px] bg-app-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Enviar a otra cuenta</h2>
        <p className="mt-1 text-sm text-app-muted">
          {source?.label ?? 'Esta cuenta'} puede enviar {stellarConfig.loyalty.code}, XLM y USD.
        </p>
        {source ? (
          <p className="mt-1 break-all font-mono text-[11px] text-app-muted">
            Desde {source.publicKey}
          </p>
        ) : null}
      </div>

      {sourceError ? (
        <ErrorModal message={sourceError} onClose={() => setSourceError(null)} />
      ) : null}

      {source ? (
        <div className="grid grid-cols-3 gap-2">
          <BalanceChip label={stellarConfig.loyalty.code} value={balances.balances.loyalty} />
          <BalanceChip label="XLM" value={balances.balances.xlm} />
          <BalanceChip label="USD" value={balances.balances.usdc} />
        </div>
      ) : null}

      <form className="flex gap-2" onSubmit={(event) => void onSearch(event)}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar email, código o public key"
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <button
          type="submit"
          className="shrink-0 rounded-2xl bg-app-chip px-3 text-sm font-medium"
        >
          Buscar
        </button>
      </form>

      {users.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {users.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => setDestination(user.publicKey)}
                className={`w-full rounded-2xl px-3 py-2 text-left text-sm ${
                  destination === user.publicKey ? 'bg-app-accent/20' : 'bg-app-chip'
                }`}
              >
                <span className="font-medium">{user.email}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-white/60">
                  {user.publicKey}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="grid gap-3" onSubmit={(event) => void onSubmit(event)}>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Public key destino
          <input
            className={`${fieldClass} font-mono`}
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="G..."
            autoComplete="off"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Monto
          <input
            className={fieldClass}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="10.00"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Moneda
          <select
            className={fieldClass}
            value={asset}
            onChange={(event) => setAsset(event.target.value)}
          >
            {ASSETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-app-muted">
            Disponible: {formatAmount(balanceLabel)} {asset === 'USD' ? 'USD' : asset}
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Concepto / Memo
          <input
            className={fieldClass}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Opcional"
            maxLength={28}
          />
        </label>
        <button
          type="submit"
          disabled={submitting || !source}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-app-accent py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}
      {hash ? (
        <p className="break-all text-sm text-green-400">
          Enviado {sentAsset}. Hash: {hash}
        </p>
      ) : null}
    </section>
  )
}

function BalanceChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-app-chip px-3 py-2">
      <p className="text-[11px] text-app-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{formatAmount(value)}</p>
    </div>
  )
}
