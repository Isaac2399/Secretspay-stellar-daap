import { useEffect, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { readableError } from '@/lib/auth/readableError'
import { categoryLabel } from '@/lib/places/categories'
import {
  decideMerchantApplication,
  fetchMerchantApplications,
} from '@/lib/merchantApplications'
import type { MerchantApplicationView } from '@/types/merchantApplication'

export function MerchantApplicationsPanel({
  onPendingCount,
}: {
  onPendingCount?: (count: number) => void
}) {
  const [rows, setRows] = useState<MerchantApplicationView[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<{ id: string; action: 'approve' | 'reject' } | null>(
    null,
  )
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function reload() {
    const next = await fetchMerchantApplications()
    setRows(next)
    onPendingCount?.(
      next.filter((row) => row.status === 'pending' || row.status === 'approving').length,
    )
  }

  useEffect(() => {
    let cancelled = false
    void fetchMerchantApplications()
      .then((next) => {
        if (cancelled) {
          return
        }
        setRows(next)
        onPendingCount?.(
          next.filter((row) => row.status === 'pending' || row.status === 'approving').length,
        )
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readableError(err))
        }
      })
    return () => {
      cancelled = true
    }
  }, [onPendingCount])

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy({ id, action })
    setError(null)
    try {
      await decideMerchantApplication({
        id,
        action,
        note: action === 'reject' ? notes[id] : undefined,
      })
      await reload()
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(null)
    }
  }

  const pending = (rows ?? []).filter(
    (row) => row.status === 'pending' || row.status === 'approving',
  )
  const reviewed = (rows ?? []).filter(
    (row) => row.status === 'approved' || row.status === 'rejected',
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        Revisa los datos del negocio y acepta para crear la cuenta, o rechaza la
        solicitud.
      </p>
      {rows === null && !error ? (
        <p className="text-sm text-app-muted">Cargando solicitudes…</p>
      ) : null}
      {error ? <ErrorModal message={error} onClose={() => setError(null)} /> : null}

      {rows && pending.length === 0 ? (
        <p className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
          No hay solicitudes de empresa en revisión.
        </p>
      ) : null}

      <ul className="grid gap-3 lg:grid-cols-2 lg:items-start">
        {pending.map((row) => (
          <li key={row.id} className="rounded-[24px] bg-app-card p-4">
            <ApplicationBody row={row} />
            <label className="mt-4 grid gap-1.5 text-xs text-app-muted">
              Nota si la rechazas (opcional)
              <textarea
                className="min-h-16 resize-y rounded-2xl border border-app-line bg-app-chip px-3 py-2 text-sm text-white outline-none"
                maxLength={280}
                value={notes[row.id] ?? ''}
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [row.id]: event.target.value }))
                }
              />
            </label>
            <div className={`mt-3 grid gap-2 ${row.status === 'pending' ? 'grid-cols-2' : ''}`}>
              <button
                type="button"
                disabled={busy?.id === row.id}
                onClick={() => void decide(row.id, 'approve')}
                className="rounded-2xl bg-app-accent py-2.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy?.id === row.id && busy.action === 'approve'
                  ? 'Creando cuenta…'
                  : row.status === 'approving'
                    ? 'Reintentar'
                    : 'Aceptar'}
              </button>
              {row.status === 'pending' ? (
                <button
                  type="button"
                  disabled={busy?.id === row.id}
                  onClick={() => void decide(row.id, 'reject')}
                  className="rounded-2xl bg-app-chip py-2.5 text-sm font-medium text-red-300 disabled:opacity-60"
                >
                  {busy?.id === row.id && busy.action === 'reject' ? 'Rechazando…' : 'Rechazar'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {reviewed.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Ya revisadas</h2>
          <ul className="grid gap-2 lg:grid-cols-2">
            {reviewed.map((row) => (
              <li key={row.id} className="rounded-[24px] bg-app-chip px-4 py-3">
                <ApplicationBody row={row} compact />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function ApplicationBody({
  row,
  compact,
}: {
  row: MerchantApplicationView
  compact?: boolean
}) {
  return (
    <div className="min-w-0 space-y-1 break-words">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium">{row.businessName}</p>
        <StatusPill status={row.status} />
      </div>
      <p className="text-xs text-white/75">
        {row.contactName} · {row.email}
      </p>
      <p className="text-xs text-app-muted">
        {categoryLabel(row.category)} · {row.phone} · cédula {row.taxId}
      </p>
      <p className="text-xs text-white/70">{row.address}</p>
      {compact ? null : (
        <p className="pt-1 text-sm leading-relaxed text-white/85">{row.description}</p>
      )}
      <p className="text-[11px] text-white/55">
        {row.acceptsRojos ? 'Quiere aceptar ROJOS' : 'No indicó ROJOS'}
        {' · '}
        {formatWhen(row.createdAt)}
      </p>
      {row.rejectionNote ? (
        <p className="text-xs text-red-300">Rechazo: {row.rejectionNote}</p>
      ) : null}
    </div>
  )
}

function StatusPill({ status }: { status: MerchantApplicationView['status'] }) {
  const label =
    status === 'pending'
      ? 'En revisión'
      : status === 'approving'
        ? 'Creando cuenta'
        : status === 'approved'
          ? 'Aceptada'
          : 'Rechazada'
  const tone =
    status === 'approved'
      ? 'text-emerald-300'
      : status === 'rejected'
        ? 'text-red-300'
        : 'text-amber-200'
  return <span className={`shrink-0 text-[11px] font-medium ${tone}`}>{label}</span>
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })
}
