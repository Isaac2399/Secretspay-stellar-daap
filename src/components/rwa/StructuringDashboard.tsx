import { useMemo, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { fieldClass } from '@/components/auth/AuthLayout'
import { useRwa } from '@/lib/rwa/RwaContext'
import { readableError } from '@/lib/auth/readableError'
import {
  ASSET_TYPE_LABELS,
  DOCUMENT_KIND_LABELS,
  LEGAL_LABELS,
  STATUS_LABELS,
  typeDetailsSummary,
  type TokenizationRequest,
  type TokenizationStatus,
} from '@/types/rwa'

const FILTERS: { id: TokenizationStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pending_audit', label: STATUS_LABELS.pending_audit },
  { id: 'legal_review', label: STATUS_LABELS.legal_review },
  { id: 'approved', label: STATUS_LABELS.approved },
  { id: 'rejected', label: STATUS_LABELS.rejected },
]

export function StructuringDashboard() {
  const { requests, loading, error, patchRequest } = useRwa()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [rugm, setRugm] = useState('')
  const [hash, setHash] = useState('')

  const filtered = useMemo(() => {
    if (filter === 'all') {
      return requests
    }
    return requests.filter((row) => row.status === filter)
  }, [requests, filter])

  const selected = requests.find((row) => row.id === selectedId) ?? null

  function openRequest(row: TokenizationRequest) {
    setSelectedId(row.id)
    setRugm(row.rugmRegistration)
    setHash(row.legalContractHash)
    setActionError(null)
  }

  async function run(action: () => Promise<unknown>) {
    setSaving(true)
    setActionError(null)
    try {
      await action()
    } catch (err) {
      setActionError(readableError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Panel de estructuración
        </p>
        <h1 className="mt-1 text-xl font-semibold">Expedientes RWA</h1>
        <p className="mt-1 text-sm text-app-muted">
          Auditoría, legal y publicación al marketplace. Solo personal interno.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === item.id ? 'bg-app-accent text-white' : 'bg-app-chip text-white/75'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-app-muted">Cargando expedientes…</p> : null}
      {error ? <ErrorModal message={error} /> : null}

      <ul className="space-y-2">
        {filtered.length === 0 ? (
          <li className="rounded-[24px] bg-app-card px-4 py-6 text-center text-sm text-app-muted">
            No hay solicitudes en este filtro. Las empresas envían desde Tokenizar mi activo.
          </li>
        ) : null}
        {filtered.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => openRequest(row)}
              className={`w-full rounded-[20px] bg-app-card p-4 text-left ${
                selectedId === row.id ? 'ring-1 ring-app-accent' : ''
              }`}
            >
              <p className="text-sm font-semibold">{row.assetName}</p>
              <p className="mt-1 text-xs text-app-muted">
                {ASSET_TYPE_LABELS[row.assetType]} · {STATUS_LABELS[row.status]}
              </p>
              <p className="mt-1 text-xs text-white/70">{row.applicantEmail}</p>
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4">
          <h2 className="text-sm font-semibold">Acciones</h2>
          <p className="text-xs text-app-muted">
            {LEGAL_LABELS[selected.legalGuarantee]} · levantar {selected.raiseAmountUsd} USDC
          </p>
          <dl className="space-y-1 rounded-2xl bg-app-chip p-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-app-muted">Tipo</dt>
              <dd className="max-w-[65%] text-right">{ASSET_TYPE_LABELS[selected.assetType]}</dd>
            </div>
            {typeDetailsSummary(selected.typeDetails).map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <dt className="text-app-muted">{row.label}</dt>
                <dd className="max-w-[65%] text-right">{row.value}</dd>
              </div>
            ))}
            {selected.documents.length ? (
              <div className="flex justify-between gap-3">
                <dt className="text-app-muted">Documentos</dt>
                <dd className="max-w-[65%] text-right">
                  {selected.documents
                    .map((row) => `${DOCUMENT_KIND_LABELS[row.kind]}: ${row.fileName}`)
                    .join(' · ')}
                </dd>
              </div>
            ) : null}
          </dl>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Número de inscripción RUGM
            <input
              className={fieldClass}
              value={rugm}
              onChange={(e) => setRugm(e.target.value)}
              placeholder="RUGM-2026-000123"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Hash del contrato / fideicomiso
            <input
              className={`${fieldClass} font-mono`}
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="sha256:…"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(() =>
                patchRequest({
                  id: selected.id,
                  rugmRegistration: rugm,
                  legalContractHash: hash,
                  status: 'legal_review',
                }),
              )
            }
            className="w-full rounded-2xl bg-app-chip py-2.5 text-sm"
          >
            Guardar respaldo legal
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(() =>
                patchRequest({
                  id: selected.id,
                  generateSpec: true,
                  status: 'approved',
                }),
              )
            }
            className="w-full rounded-2xl bg-app-chip py-2.5 text-sm"
          >
            Generar spec de asset Stellar
          </button>
          {selected.stellarAssetSpec ? (
            <pre className="overflow-auto rounded-2xl bg-black/40 p-3 font-mono text-[11px] text-white/80">
              {JSON.stringify(selected.stellarAssetSpec, null, 2)}
            </pre>
          ) : null}
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-app-chip px-3 py-3 text-sm">
            Aprobar y publicar al marketplace
            <input
              type="checkbox"
              checked={selected.published}
              disabled={saving}
              onChange={(event) =>
                void run(() =>
                  patchRequest({
                    id: selected.id,
                    published: event.target.checked,
                    rugmRegistration: rugm,
                    legalContractHash: hash,
                  }),
                )
              }
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(() =>
                patchRequest({
                  id: selected.id,
                  status: 'rejected',
                  rejectionReason: 'No cumple requisitos de estructuración',
                }),
              )
            }
            className="w-full rounded-2xl py-2.5 text-sm text-red-400"
          >
            Rechazar
          </button>
          {actionError ? <ErrorModal message={actionError} onClose={() => setActionError(null)} /> : null}
        </div>
      ) : null}
    </section>
  )
}
