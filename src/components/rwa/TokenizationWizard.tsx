import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { fieldClass } from '@/components/auth/AuthLayout'
import { AuthSubmitButton } from '@/components/auth/formHelpers'
import { DynamicAssetFields } from '@/components/rwa/DynamicAssetFields'
import { useRwa } from '@/lib/rwa/RwaContext'
import { readableError } from '@/lib/auth/readableError'
import {
  APY_BASIS_LABELS,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_OPTIONS,
  DOCUMENT_KIND_LABELS,
  FREQUENCY_LABELS,
  LEGAL_LABELS,
  emptyTypeDetails,
  isTypeSpecificDocumentKind,
  typeDetailsSummary,
  validateTypeDetails,
  type DividendFrequency,
  type LegalGuarantee,
  type RwaAssetType,
  type RwaDocumentKind,
  type RwaDocumentPlaceholder,
  type TokenizationTypeDetails,
  type TokenizationWizardPayload,
} from '@/types/rwa'

const STEPS = [
  'Perfil del activo',
  'Formulario dinámico',
  'Respaldo legal',
  'Parámetros financieros',
  'Resumen',
] as const

const emptyForm: TokenizationWizardPayload = {
  assetName: '',
  assetType: 'equity_inmobiliario',
  estimatedValuationUsd: '',
  typeDetails: emptyTypeDetails('equity_inmobiliario'),
  legalGuarantee: 'rugm',
  ownerLegalName: '',
  ownerIdNumber: '',
  ownerCompany: '',
  documents: [],
  raiseAmountUsd: '',
  expectedApy: '',
  dividendFrequency: 'monthly',
}

export function TokenizationWizard() {
  const { submit } = useRwa()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<TokenizationWizardPayload>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [payloadPreview, setPayloadPreview] = useState<string | null>(null)

  function update<K extends keyof TokenizationWizardPayload>(
    key: K,
    value: TokenizationWizardPayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function setAssetType(assetType: RwaAssetType) {
    setForm((current) => ({
      ...current,
      assetType,
      typeDetails: emptyTypeDetails(assetType),
      documents: current.documents.filter((row) => !isTypeSpecificDocumentKind(row.kind)),
    }))
  }

  function setTypeDetails(typeDetails: TokenizationTypeDetails) {
    update('typeDetails', typeDetails)
  }

  function addDocument(kind: RwaDocumentKind, fileName: string) {
    if (!fileName) {
      return
    }
    setForm((current) => ({
      ...current,
      documents: [
        ...current.documents.filter((row) => row.kind !== kind),
        { kind, fileName },
      ],
    }))
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (form.assetName.trim().length < 3) {
        return 'Ponga un nombre claro del activo (local, flota, cartera…).'
      }
      if (!/^\d+(\.\d{1,2})?$/.test(form.estimatedValuationUsd)) {
        return 'Indique la valuación estimada en USD.'
      }
    }
    if (step === 1) {
      const details =
        form.typeDetails.kind === form.assetType
          ? form.typeDetails
          : emptyTypeDetails(form.assetType)
      return validateTypeDetails(details, form.documents)
    }
    if (step === 2) {
      if (form.ownerLegalName.trim().length < 3) {
        return 'Indique el nombre del titular o representante.'
      }
      if (form.ownerIdNumber.trim().length < 5) {
        return 'Indique cédula jurídica o física.'
      }
    }
    if (step === 3) {
      if (!/^\d+(\.\d{1,2})?$/.test(form.raiseAmountUsd)) {
        return 'Indique cuánto desea levantar en USDC.'
      }
      if (!/^\d+(\.\d{1,2})?$/.test(form.expectedApy)) {
        return 'Indique el rendimiento anual esperado (%).'
      }
      if (Number(form.raiseAmountUsd) > Number(form.estimatedValuationUsd)) {
        return 'El monto a levantar no puede superar la valuación estimada.'
      }
    }
    return null
  }

  function onNext() {
    const message = validateStep()
    if (message) {
      setError(message)
      return
    }
    setError(null)
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = validateStep()
    if (message) {
      setError(message)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload: TokenizationWizardPayload = {
        ...form,
        typeDetails:
          form.typeDetails.kind === form.assetType
            ? form.typeDetails
            : emptyTypeDetails(form.assetType),
      }
      const request = await submit(payload)
      setPayloadPreview(JSON.stringify({ pending_tokenizations: request }, null, 2))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (payloadPreview) {
    return (
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Solicitud enviada
        </p>
        <h1 className="text-xl font-semibold">Quedó en cola de estructuración</h1>
        <p className="text-sm text-app-muted">
          El expediente se guardó en <span className="font-mono">pending_tokenizations</span>.
          Legal y auditoría lo revisan antes de emitir el asset Stellar.
        </p>
        <pre className="max-h-64 overflow-auto rounded-[20px] bg-app-chip p-3 font-mono text-[11px] text-white/80">
          {payloadPreview}
        </pre>
        <button
          type="button"
          onClick={() => navigate('/rwa')}
          className="w-full rounded-2xl bg-app-accent py-3 text-sm font-medium"
        >
          Volver a Aprender RWA
        </button>
      </section>
    )
  }

  const apyBasisLabel =
    form.typeDetails.kind === 'renta_flujo_caja'
      ? APY_BASIS_LABELS[form.typeDetails.apyBasis]
      : null

  return (
    <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-app-accent">
          Tokenizar mi activo
        </p>
        <h1 className="mt-1 text-xl font-semibold">Expediente de tokenización</h1>
        <p className="mt-1 text-sm text-app-muted">
          Paso {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      <div className="flex gap-1">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`h-1 flex-1 rounded-full ${
              index <= step ? 'bg-app-accent' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4">
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Nombre del activo
            <input
              className={fieldClass}
              value={form.assetName}
              onChange={(e) => update('assetName', e.target.value)}
              placeholder="Ej. Local comercial en Curridabat"
            />
          </label>
          <p className="text-sm font-medium text-white/80">Tipo de tokenización</p>
          <div className="grid gap-2">
            {ASSET_TYPE_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAssetType(value)}
                className={`rounded-2xl px-3 py-2.5 text-left text-xs font-medium ${
                  form.assetType === value
                    ? 'bg-app-accent text-white'
                    : 'bg-app-chip text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Valuación estimada (USD)
            <input
              className={fieldClass}
              inputMode="decimal"
              value={form.estimatedValuationUsd}
              onChange={(e) => update('estimatedValuationUsd', e.target.value)}
              placeholder="250000"
            />
          </label>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4">
          <div>
            <p className="text-sm font-medium text-white/80">Datos específicos</p>
            <p className="mt-1 text-xs text-app-muted">
              {ASSET_TYPE_LABELS[form.assetType]}
            </p>
          </div>
          <DynamicAssetFields
            form={form}
            onDetailsChange={setTypeDetails}
            onPickDocument={addDocument}
          />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4">
          <p className="text-sm font-medium text-white/80">Garantía legal</p>
          {(Object.entries(LEGAL_LABELS) as [LegalGuarantee, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update('legalGuarantee', value)}
                className={`w-full rounded-2xl px-3 py-3 text-left text-sm ${
                  form.legalGuarantee === value
                    ? 'bg-app-accent text-white'
                    : 'bg-app-chip text-white/80'
                }`}
              >
                {label}
              </button>
            ),
          )}
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Titular / representante
            <input
              className={fieldClass}
              value={form.ownerLegalName}
              onChange={(e) => update('ownerLegalName', e.target.value)}
              placeholder="Nombre completo"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Cédula física o jurídica
            <input
              className={fieldClass}
              value={form.ownerIdNumber}
              onChange={(e) => update('ownerIdNumber', e.target.value)}
              placeholder="3-101-xxxxxx"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Sociedad (opcional)
            <input
              className={fieldClass}
              value={form.ownerCompany}
              onChange={(e) => update('ownerCompany', e.target.value)}
              placeholder="S.A. / SRL"
            />
          </label>
          <DocumentField
            label="Título o gravamen (placeholder)"
            kind="titulo"
            current={form.documents}
            onPick={addDocument}
          />
          <DocumentField
            label="Estados financieros (placeholder)"
            kind="estados_financieros"
            current={form.documents}
            onPick={addDocument}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4">
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Monto a levantar (USDC)
            <input
              className={fieldClass}
              inputMode="decimal"
              value={form.raiseAmountUsd}
              onChange={(e) => update('raiseAmountUsd', e.target.value)}
              placeholder="80000"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-white/80">
            Rendimiento anual esperado (% APY)
            <input
              className={fieldClass}
              inputMode="decimal"
              value={form.expectedApy}
              onChange={(e) => update('expectedApy', e.target.value)}
              placeholder="8.5"
            />
          </label>
          {apyBasisLabel ? (
            <p className="text-xs text-app-muted">
              Este APY se registrará como {apyBasisLabel.toLowerCase()}, según el formulario
              de renta / flujo de caja.
            </p>
          ) : null}
          <p className="text-sm font-medium text-white/80">Frecuencia de dividendos</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(FREQUENCY_LABELS) as [DividendFrequency, string][]).map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('dividendFrequency', value)}
                  className={`rounded-2xl py-2.5 text-sm font-medium ${
                    form.dividendFrequency === value
                      ? 'bg-app-accent text-white'
                      : 'bg-app-chip text-white/80'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-3 rounded-[24px] bg-app-card p-4 text-sm">
          <SummaryRow label="Activo" value={form.assetName} />
          <SummaryRow label="Tipo" value={ASSET_TYPE_LABELS[form.assetType]} />
          <SummaryRow label="Valuación" value={`USD ${form.estimatedValuationUsd}`} />
          {typeDetailsSummary(form.typeDetails).map((row) => (
            <SummaryRow key={row.label} label={row.label} value={row.value} />
          ))}
          <SummaryRow label="Garantía" value={LEGAL_LABELS[form.legalGuarantee]} />
          <SummaryRow label="Titular" value={form.ownerLegalName} />
          <SummaryRow label="Cédula" value={form.ownerIdNumber} />
          <SummaryRow label="Levantar" value={`${form.raiseAmountUsd} USDC`} />
          <SummaryRow
            label="APY"
            value={
              apyBasisLabel
                ? `${form.expectedApy}% (${apyBasisLabel})`
                : `${form.expectedApy}%`
            }
          />
          <SummaryRow
            label="Dividendos"
            value={FREQUENCY_LABELS[form.dividendFrequency]}
          />
          <SummaryRow
            label="Documentos"
            value={
              form.documents.length
                ? form.documents
                    .map((row) => `${DOCUMENT_KIND_LABELS[row.kind]}: ${row.fileName}`)
                    .join(' · ')
                : 'Sin archivos (placeholders)'
            }
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setStep((current) => Math.max(0, current - 1))
            }}
            className="flex-1 rounded-2xl bg-app-chip py-3 text-sm font-medium"
          >
            Atrás
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={onNext}
            className="flex-1 rounded-2xl bg-app-accent py-3 text-sm font-medium"
          >
            Continuar
          </button>
        ) : (
          <div className="flex-1">
            <AuthSubmitButton
              submitting={submitting}
              idleLabel="Enviar a estructuración"
              busyLabel="Enviando…"
            />
          </div>
        )}
      </div>
    </form>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-2 last:border-0">
      <span className="text-app-muted">{label}</span>
      <span className="max-w-[60%] text-right">{value}</span>
    </div>
  )
}

function DocumentField({
  label,
  kind,
  current,
  onPick,
}: {
  label: string
  kind: RwaDocumentPlaceholder['kind']
  current: RwaDocumentPlaceholder[]
  onPick: (kind: RwaDocumentPlaceholder['kind'], fileName: string) => void
}) {
  const selected = current.find((row) => row.kind === kind)
  return (
    <label className="grid gap-1.5 text-sm font-medium text-white/80">
      {label}
      <input
        className={fieldClass}
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          onPick(kind, file?.name ?? '')
        }}
      />
      {selected ? (
        <span className="text-xs text-app-accent">{selected.fileName}</span>
      ) : (
        <span className="text-xs text-app-muted">No se sube el archivo; solo el nombre para el expediente.</span>
      )}
    </label>
  )
}
