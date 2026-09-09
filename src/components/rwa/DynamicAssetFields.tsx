import { fieldClass } from '@/components/auth/AuthLayout'
import {
  APY_BASIS_LABELS,
  DOCUMENT_KIND_LABELS,
  EQUITY_PHASE_LABELS,
  emptyTypeDetails,
  type RwaDocumentKind,
  type RwaDocumentPlaceholder,
  type TokenizationTypeDetails,
  type TokenizationWizardPayload,
} from '@/types/rwa'

export function DynamicAssetFields({
  form,
  onDetailsChange,
  onPickDocument,
}: {
  form: TokenizationWizardPayload
  onDetailsChange: (details: TokenizationTypeDetails) => void
  onPickDocument: (kind: RwaDocumentKind, fileName: string) => void
}) {
  const details =
    form.typeDetails.kind === form.assetType
      ? form.typeDetails
      : emptyTypeDetails(form.assetType)

  if (details.kind === 'equity_inmobiliario') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-white/80">Fase del proyecto</p>
        <ChoiceRow
          options={EQUITY_PHASE_LABELS}
          value={details.projectPhase}
          onChange={(projectPhase) => onDetailsChange({ ...details, projectPhase })}
        />
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Fecha estimada de inicio
          <input
            className={fieldClass}
            type="date"
            value={details.estimatedStartDate}
            onChange={(event) =>
              onDetailsChange({ ...details, estimatedStartDate: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Fecha estimada de entrega
          <input
            className={fieldClass}
            type="date"
            value={details.estimatedDeliveryDate}
            onChange={(event) =>
              onDetailsChange({ ...details, estimatedDeliveryDate: event.target.value })
            }
          />
        </label>
        <DocumentField
          kind="permisos_viabilidad"
          current={form.documents}
          onPick={onPickDocument}
        />
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Estrategia de salida / liquidación del capital
          <textarea
            className={`${fieldClass} min-h-24`}
            value={details.exitStrategy}
            onChange={(event) =>
              onDetailsChange({ ...details, exitStrategy: event.target.value })
            }
            placeholder="Venta del activo, refinanciamiento, buyback, etc."
          />
        </label>
      </div>
    )
  }

  if (details.kind === 'renta_flujo_caja') {
    return (
      <div className="space-y-3">
        <DocumentField
          kind="historico_ocupacion"
          current={form.documents}
          onPick={onPickDocument}
        />
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Gastos operativos estimados (OpEx / Property Management)
          <input
            className={fieldClass}
            value={details.operatingExpenses}
            onChange={(event) =>
              onDetailsChange({ ...details, operatingExpenses: event.target.value })
            }
            placeholder="Ej. 18% o 1 200 USD/mes"
          />
        </label>
        <p className="text-sm font-medium text-white/80">El APY ingresado es</p>
        <ChoiceRow
          options={APY_BASIS_LABELS}
          value={details.apyBasis}
          onChange={(apyBasis) => onDetailsChange({ ...details, apyBasis })}
        />
      </div>
    )
  }

  if (details.kind === 'uso_fraccionado') {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-white/80">
          Matriz de días asignados por token
        </p>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Alta temporada
          <input
            className={fieldClass}
            value={details.highSeasonDays}
            onChange={(event) =>
              onDetailsChange({ ...details, highSeasonDays: event.target.value })
            }
            placeholder="Ej. 14 días"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Media temporada
          <input
            className={fieldClass}
            value={details.midSeasonDays}
            onChange={(event) =>
              onDetailsChange({ ...details, midSeasonDays: event.target.value })
            }
            placeholder="Ej. 21 días"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Baja temporada
          <input
            className={fieldClass}
            value={details.lowSeasonDays}
            onChange={(event) =>
              onDetailsChange({ ...details, lowSeasonDays: event.target.value })
            }
            placeholder="Ej. 30 días"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Cuota de mantenimiento anual estimada por token (USD)
          <input
            className={fieldClass}
            inputMode="decimal"
            value={details.annualMaintenanceUsd}
            onChange={(event) =>
              onDetailsChange({ ...details, annualMaintenanceUsd: event.target.value })
            }
            placeholder="450"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Reglas de subarriendo o acumulación de días no usados
          <textarea
            className={`${fieldClass} min-h-24`}
            value={details.subletRules}
            onChange={(event) =>
              onDetailsChange({ ...details, subletRules: event.target.value })
            }
            placeholder="¿Se pueden acumular, ceder o subarrendar los días?"
          />
        </label>
      </div>
    )
  }

  if (details.kind === 'agricola_exportacion') {
    return (
      <div className="space-y-3">
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Tipo de cultivo
          <input
            className={fieldClass}
            value={details.cropType}
            onChange={(event) =>
              onDetailsChange({ ...details, cropType: event.target.value })
            }
            placeholder="Café, piña, cacao…"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Variedad específica
          <input
            className={fieldClass}
            value={details.cropVariety}
            onChange={(event) =>
              onDetailsChange({ ...details, cropVariety: event.target.value })
            }
            placeholder="Caturra, Geisha…"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Certificaciones aplicables
          <input
            className={fieldClass}
            value={details.certifications}
            onChange={(event) =>
              onDetailsChange({ ...details, certifications: event.target.value })
            }
            placeholder="ICAFE, Orgánico, Rainforest Alliance…"
          />
        </label>
        <DocumentField
          kind="offtake_agreement"
          current={form.documents}
          onPick={onPickDocument}
        />
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Hectáreas en producción
          <input
            className={fieldClass}
            inputMode="decimal"
            value={details.hectaresInProduction}
            onChange={(event) =>
              onDetailsChange({ ...details, hectaresInProduction: event.target.value })
            }
            placeholder="12.5"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-white/80">
          Seguro agrícola
          <input
            className={fieldClass}
            value={details.agriculturalInsurance}
            onChange={(event) =>
              onDetailsChange({ ...details, agriculturalInsurance: event.target.value })
            }
            placeholder="Póliza, cobertura o aseguradora"
          />
        </label>
        <DocumentField
          kind="plano_catastrado"
          current={form.documents}
          onPick={onPickDocument}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <label className="grid gap-1.5 text-sm font-medium text-white/80">
        Estándar / metodología de certificación
        <input
          className={fieldClass}
          value={details.certificationStandard}
          onChange={(event) =>
            onDetailsChange({ ...details, certificationStandard: event.target.value })
          }
          placeholder="Verra, Gold Standard, PSA Fonafifo…"
        />
      </label>
      <DocumentField
        kind="mrv_auditoria"
        current={form.documents}
        onPick={onPickDocument}
      />
      <label className="grid gap-1.5 text-sm font-medium text-white/80">
        Año de acreditación (Vintage Year)
        <input
          className={fieldClass}
          inputMode="numeric"
          maxLength={4}
          value={details.vintageYear}
          onChange={(event) =>
            onDetailsChange({ ...details, vintageYear: event.target.value })
          }
          placeholder="2026"
        />
      </label>
    </div>
  )
}

function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Record<T, string>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="grid gap-2">
      {(Object.entries(options) as [T, string][]).map(([option, label]) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-2xl px-3 py-2.5 text-left text-sm font-medium ${
            value === option ? 'bg-app-accent text-white' : 'bg-app-chip text-white/80'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function DocumentField({
  kind,
  current,
  onPick,
}: {
  kind: RwaDocumentKind
  current: RwaDocumentPlaceholder[]
  onPick: (kind: RwaDocumentKind, fileName: string) => void
}) {
  const selected = current.find((row) => row.kind === kind)
  return (
    <label className="grid gap-1.5 text-sm font-medium text-white/80">
      {DOCUMENT_KIND_LABELS[kind]}
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
        <span className="text-xs text-app-muted">
          No se sube el archivo; solo el nombre para el expediente.
        </span>
      )}
    </label>
  )
}
