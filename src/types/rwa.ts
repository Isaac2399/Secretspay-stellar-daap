export type RwaAssetType =
  | 'equity_inmobiliario'
  | 'renta_flujo_caja'
  | 'uso_fraccionado'
  | 'agricola_exportacion'
  | 'creditos_carbono'

export type LegalGuarantee = 'rugm' | 'fideicomiso'

export type DividendFrequency = 'monthly' | 'quarterly'

export type TokenizationStatus =
  | 'pending_audit'
  | 'legal_review'
  | 'approved'
  | 'rejected'

export type EquityProjectPhase = 'en_plano' | 'en_construccion' | 'finalizado'

export type ApyBasis = 'bruto' | 'neto'

export type RwaDocumentKind =
  | 'titulo'
  | 'estados_financieros'
  | 'identificacion'
  | 'otro'
  | 'permisos_viabilidad'
  | 'historico_ocupacion'
  | 'offtake_agreement'
  | 'plano_catastrado'
  | 'mrv_auditoria'

export type RwaDocumentPlaceholder = {
  kind: RwaDocumentKind
  fileName: string
}

export type EquityInmobiliarioDetails = {
  kind: 'equity_inmobiliario'
  projectPhase: EquityProjectPhase
  estimatedStartDate: string
  estimatedDeliveryDate: string
  exitStrategy: string
}

export type RentaFlujoCajaDetails = {
  kind: 'renta_flujo_caja'
  operatingExpenses: string
  apyBasis: ApyBasis
}

export type UsoFraccionadoDetails = {
  kind: 'uso_fraccionado'
  highSeasonDays: string
  midSeasonDays: string
  lowSeasonDays: string
  annualMaintenanceUsd: string
  subletRules: string
}

export type AgricolaExportacionDetails = {
  kind: 'agricola_exportacion'
  cropType: string
  cropVariety: string
  certifications: string
  hectaresInProduction: string
  agriculturalInsurance: string
}

export type CreditosCarbonoDetails = {
  kind: 'creditos_carbono'
  certificationStandard: string
  vintageYear: string
}

export type TokenizationTypeDetails =
  | EquityInmobiliarioDetails
  | RentaFlujoCajaDetails
  | UsoFraccionadoDetails
  | AgricolaExportacionDetails
  | CreditosCarbonoDetails

export type StellarAssetSpec = {
  issuerPublicKey: string
  distributionPublicKey: string
  assetCode: string
  totalSupply: string
  metadata: {
    homeDomain?: string
    legalGuarantee: LegalGuarantee
    rugmRegistration?: string
    legalContractHash?: string
    notes?: string
  }
}

export type TokenizationRequest = {
  id: string
  createdAt: string
  updatedAt: string
  applicantUserId: string
  applicantEmail: string
  applicantPublicKey: string
  assetName: string
  assetType: RwaAssetType
  estimatedValuationUsd: string
  typeDetails: TokenizationTypeDetails
  legalGuarantee: LegalGuarantee
  ownerLegalName: string
  ownerIdNumber: string
  ownerCompany: string
  documents: RwaDocumentPlaceholder[]
  raiseAmountUsd: string
  expectedApy: string
  dividendFrequency: DividendFrequency
  status: TokenizationStatus
  rugmRegistration: string
  legalContractHash: string
  stellarAssetSpec: StellarAssetSpec | null
  published: boolean
  rejectionReason: string
}

export type MarketplaceListing = {
  id: string
  requestId: string | null
  assetCode: string
  name: string
  assetType: RwaAssetType
  apy: string
  legalBacking: LegalGuarantee
  raisedUsd: string
  targetUsd: string
  minInvestmentUsd: string
  issuerPublicKey: string
  distributionPublicKey: string
  description: string
  nextPayoutDate: string
  totalSupply: string
  published: boolean
  dividendFrequency: DividendFrequency
}

export type RwaHolding = {
  listingId: string
  assetCode: string
  tokens: string
  investedUsd: string
  claimedDividendsUsd: string
  lastInvestTxHash?: string
}

export type TokenizationWizardPayload = {
  assetName: string
  assetType: RwaAssetType
  estimatedValuationUsd: string
  typeDetails: TokenizationTypeDetails
  legalGuarantee: LegalGuarantee
  ownerLegalName: string
  ownerIdNumber: string
  ownerCompany: string
  documents: RwaDocumentPlaceholder[]
  raiseAmountUsd: string
  expectedApy: string
  dividendFrequency: DividendFrequency
}

export const ASSET_TYPE_LABELS: Record<RwaAssetType, string> = {
  equity_inmobiliario: 'Equity Inmobiliario (Plusvalía / Desarrollo)',
  renta_flujo_caja: 'Renta / Flujo de Caja (Yield Tokens para Airbnb o Comercial)',
  uso_fraccionado: 'Uso Fraccionado (Fractional Pass / Tiempos compartidos)',
  agricola_exportacion: 'Agrícola de Exportación (Cosechas / Forward Contracts)',
  creditos_carbono: 'Créditos de Carbono y Biodiversidad',
}

export const ASSET_TYPE_OPTIONS = Object.entries(ASSET_TYPE_LABELS) as [
  RwaAssetType,
  string,
][]

export const EQUITY_PHASE_LABELS: Record<EquityProjectPhase, string> = {
  en_plano: 'En plano',
  en_construccion: 'En construcción',
  finalizado: 'Finalizado',
}

export const APY_BASIS_LABELS: Record<ApyBasis, string> = {
  bruto: 'Bruto',
  neto: 'Neto',
}

export const DOCUMENT_KIND_LABELS: Record<RwaDocumentKind, string> = {
  titulo: 'Título o gravamen',
  estados_financieros: 'Estados financieros',
  identificacion: 'Identificación',
  otro: 'Otro documento',
  permisos_viabilidad: 'Permisos de viabilidad/construcción (SETENA / Municipalidad)',
  historico_ocupacion: 'Histórico de ocupación o contratos de arrendamiento',
  offtake_agreement: 'Contrato de compraventa / Carta de intención (Offtake)',
  plano_catastrado: 'Plano catastrado / hectáreas y seguro agrícola',
  mrv_auditoria: 'Auditoría/verificación MRV',
}

export const TYPE_SPECIFIC_DOCUMENT_KINDS: readonly RwaDocumentKind[] = [
  'permisos_viabilidad',
  'historico_ocupacion',
  'offtake_agreement',
  'plano_catastrado',
  'mrv_auditoria',
]

export const LEGAL_LABELS: Record<LegalGuarantee, string> = {
  rugm: 'Garantía Mobiliaria Ley 9078 (RUGM)',
  fideicomiso: 'Fideicomiso',
}

export const LEGAL_BADGE: Record<LegalGuarantee, string> = {
  rugm: 'Garantía Mobiliaria RUGM vigente',
  fideicomiso: 'Fideicomiso de garantía',
}

export const STATUS_LABELS: Record<TokenizationStatus, string> = {
  pending_audit: 'Auditoría pendiente',
  legal_review: 'Revisión legal',
  approved: 'Aprobado / listo para mint',
  rejected: 'Rechazado',
}

export const FREQUENCY_LABELS: Record<DividendFrequency, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
}

export function emptyTypeDetails(assetType: RwaAssetType): TokenizationTypeDetails {
  switch (assetType) {
    case 'equity_inmobiliario':
      return {
        kind: 'equity_inmobiliario',
        projectPhase: 'en_plano',
        estimatedStartDate: '',
        estimatedDeliveryDate: '',
        exitStrategy: '',
      }
    case 'renta_flujo_caja':
      return {
        kind: 'renta_flujo_caja',
        operatingExpenses: '',
        apyBasis: 'bruto',
      }
    case 'uso_fraccionado':
      return {
        kind: 'uso_fraccionado',
        highSeasonDays: '',
        midSeasonDays: '',
        lowSeasonDays: '',
        annualMaintenanceUsd: '',
        subletRules: '',
      }
    case 'agricola_exportacion':
      return {
        kind: 'agricola_exportacion',
        cropType: '',
        cropVariety: '',
        certifications: '',
        hectaresInProduction: '',
        agriculturalInsurance: '',
      }
    case 'creditos_carbono':
      return {
        kind: 'creditos_carbono',
        certificationStandard: '',
        vintageYear: '',
      }
  }
}

export function isRwaAssetType(value: string): value is RwaAssetType {
  return value in ASSET_TYPE_LABELS
}

export function isTypeSpecificDocumentKind(kind: RwaDocumentKind): boolean {
  return TYPE_SPECIFIC_DOCUMENT_KINDS.includes(kind)
}

export function hasDocument(
  documents: RwaDocumentPlaceholder[],
  kind: RwaDocumentKind,
): boolean {
  return documents.some((row) => row.kind === kind && row.fileName.trim().length > 0)
}

export function typeDetailsSummary(
  details: TokenizationTypeDetails,
): { label: string; value: string }[] {
  switch (details.kind) {
    case 'equity_inmobiliario':
      return [
        { label: 'Fase del proyecto', value: EQUITY_PHASE_LABELS[details.projectPhase] },
        { label: 'Inicio estimado', value: details.estimatedStartDate || '—' },
        { label: 'Entrega estimada', value: details.estimatedDeliveryDate || '—' },
        { label: 'Estrategia de salida', value: details.exitStrategy || '—' },
      ]
    case 'renta_flujo_caja':
      return [
        { label: 'OpEx / Property Management', value: details.operatingExpenses || '—' },
        { label: 'APY informado', value: APY_BASIS_LABELS[details.apyBasis] },
      ]
    case 'uso_fraccionado':
      return [
        { label: 'Días alta temporada', value: details.highSeasonDays || '—' },
        { label: 'Días media temporada', value: details.midSeasonDays || '—' },
        { label: 'Días baja temporada', value: details.lowSeasonDays || '—' },
        { label: 'Cuota mantenimiento / token', value: details.annualMaintenanceUsd ? `USD ${details.annualMaintenanceUsd}` : '—' },
        { label: 'Subarriendo / días no usados', value: details.subletRules || '—' },
      ]
    case 'agricola_exportacion':
      return [
        { label: 'Cultivo', value: details.cropType || '—' },
        { label: 'Variedad', value: details.cropVariety || '—' },
        { label: 'Certificaciones', value: details.certifications || '—' },
        { label: 'Hectáreas en producción', value: details.hectaresInProduction || '—' },
        { label: 'Seguro agrícola', value: details.agriculturalInsurance || '—' },
      ]
    case 'creditos_carbono':
      return [
        { label: 'Estándar / metodología', value: details.certificationStandard || '—' },
        { label: 'Año de acreditación (vintage)', value: details.vintageYear || '—' },
      ]
  }
}

export function validateTypeDetails(
  details: TokenizationTypeDetails,
  documents: RwaDocumentPlaceholder[],
): string | null {
  switch (details.kind) {
    case 'equity_inmobiliario': {
      if (!details.estimatedStartDate) {
        return 'Indique la fecha estimada de inicio.'
      }
      if (!details.estimatedDeliveryDate) {
        return 'Indique la fecha estimada de entrega.'
      }
      if (details.estimatedDeliveryDate < details.estimatedStartDate) {
        return 'La fecha de entrega no puede ser anterior al inicio.'
      }
      if (details.exitStrategy.trim().length < 8) {
        return 'Describa la estrategia de salida / liquidación del capital.'
      }
      if (!hasDocument(documents, 'permisos_viabilidad')) {
        return 'Adjunte los permisos de viabilidad/construcción (SETENA / Municipalidad).'
      }
      return null
    }
    case 'renta_flujo_caja': {
      if (!hasDocument(documents, 'historico_ocupacion')) {
        return 'Adjunte el histórico de ocupación o los contratos de arrendamiento vigentes.'
      }
      if (details.operatingExpenses.trim().length < 1) {
        return 'Indique el porcentaje o monto estimado de gastos operativos (OpEx).'
      }
      return null
    }
    case 'uso_fraccionado': {
      if (!details.highSeasonDays.trim() || !details.midSeasonDays.trim() || !details.lowSeasonDays.trim()) {
        return 'Complete la matriz de días asignados por token (alta, media y baja temporada).'
      }
      if (!/^\d+(\.\d{1,2})?$/.test(details.annualMaintenanceUsd.trim())) {
        return 'Indique la cuota de mantenimiento anual estimada por token (USD).'
      }
      if (details.subletRules.trim().length < 8) {
        return 'Describa las reglas de subarriendo o acumulación de días no usados.'
      }
      return null
    }
    case 'agricola_exportacion': {
      if (details.cropType.trim().length < 2) {
        return 'Indique el tipo de cultivo.'
      }
      if (details.cropVariety.trim().length < 2) {
        return 'Indique la variedad específica del cultivo.'
      }
      if (details.certifications.trim().length < 2) {
        return 'Indique las certificaciones aplicables (ICAFE, Orgánico, Rainforest, etc.).'
      }
      if (!hasDocument(documents, 'offtake_agreement')) {
        return 'Adjunte el contrato de compraventa o carta de intención internacional (Offtake).'
      }
      if (!/^\d+(\.\d{1,2})?$/.test(details.hectaresInProduction.trim()) || Number(details.hectaresInProduction) <= 0) {
        return 'Indique las hectáreas en producción.'
      }
      if (details.agriculturalInsurance.trim().length < 3) {
        return 'Indique el seguro agrícola (póliza o cobertura).'
      }
      if (!hasDocument(documents, 'plano_catastrado')) {
        return 'Adjunte el plano catastrado / respaldo de hectáreas y seguro agrícola.'
      }
      return null
    }
    case 'creditos_carbono': {
      if (details.certificationStandard.trim().length < 3) {
        return 'Indique el estándar o metodología de certificación (Verra, Gold Standard, PSA Fonafifo, etc.).'
      }
      if (!hasDocument(documents, 'mrv_auditoria')) {
        return 'Adjunte el documento de auditoría/verificación MRV.'
      }
      if (!/^\d{4}$/.test(details.vintageYear.trim())) {
        return 'Indique el año de acreditación (Vintage Year) con 4 dígitos.'
      }
      const year = Number(details.vintageYear)
      const maxYear = new Date().getFullYear() + 2
      if (year < 1990 || year > maxYear) {
        return 'El año de acreditación está fuera de un rango válido.'
      }
      return null
    }
  }
}
