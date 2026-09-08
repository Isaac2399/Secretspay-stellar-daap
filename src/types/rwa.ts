export type RwaAssetType = 'inmueble' | 'vehiculo' | 'factura' | 'flujo_caja'

export type LegalGuarantee = 'rugm' | 'fideicomiso'

export type DividendFrequency = 'monthly' | 'quarterly'

export type TokenizationStatus =
  | 'pending_audit'
  | 'legal_review'
  | 'approved'
  | 'rejected'

export type RwaDocumentPlaceholder = {
  kind: 'titulo' | 'estados_financieros' | 'identificacion' | 'otro'
  fileName: string
}

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
  inmueble: 'Inmueble',
  vehiculo: 'Vehículo / Flota',
  factura: 'Factura / Factoring',
  flujo_caja: 'Flujo de caja',
}

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
