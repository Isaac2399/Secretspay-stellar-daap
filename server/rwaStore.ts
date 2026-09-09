import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthError } from './errors.js'
import { loyaltyAssetFromEnv, usdcAssetFromEnv } from './provisionAccount.js'

type RwaAssetType =
  | 'equity_inmobiliario'
  | 'renta_flujo_caja'
  | 'uso_fraccionado'
  | 'agricola_exportacion'
  | 'creditos_carbono'
type LegalGuarantee = 'rugm' | 'fideicomiso'
type DividendFrequency = 'monthly' | 'quarterly'
type TokenizationStatus =
  | 'pending_audit'
  | 'legal_review'
  | 'approved'
  | 'rejected'
type EquityProjectPhase = 'en_plano' | 'en_construccion' | 'finalizado'
type ApyBasis = 'bruto' | 'neto'
type RwaDocumentKind =
  | 'titulo'
  | 'estados_financieros'
  | 'identificacion'
  | 'otro'
  | 'permisos_viabilidad'
  | 'historico_ocupacion'
  | 'offtake_agreement'
  | 'plano_catastrado'
  | 'mrv_auditoria'

export type TokenizationTypeDetails =
  | {
      kind: 'equity_inmobiliario'
      projectPhase: EquityProjectPhase
      estimatedStartDate: string
      estimatedDeliveryDate: string
      exitStrategy: string
    }
  | {
      kind: 'renta_flujo_caja'
      operatingExpenses: string
      apyBasis: ApyBasis
    }
  | {
      kind: 'uso_fraccionado'
      highSeasonDays: string
      midSeasonDays: string
      lowSeasonDays: string
      annualMaintenanceUsd: string
      subletRules: string
    }
  | {
      kind: 'agricola_exportacion'
      cropType: string
      cropVariety: string
      certifications: string
      hectaresInProduction: string
      agriculturalInsurance: string
    }
  | {
      kind: 'creditos_carbono'
      certificationStandard: string
      vintageYear: string
    }

type StellarAssetSpec = {
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
  documents: { kind: RwaDocumentKind; fileName: string }[]
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
  documents: TokenizationRequest['documents']
  raiseAmountUsd: string
  expectedApy: string
  dividendFrequency: DividendFrequency
}

export type RwaStore = {
  requests: TokenizationRequest[]
  listings: MarketplaceListing[]
  holdings: Record<string, RwaHolding[]>
}

const RWA_FILE = join('data', 'rwa.json')
const KV_KEY = 'stellar-web-app:rwa'

export async function loadRwaStore(): Promise<RwaStore> {
  const loaded = await readStore()
  return seedIfEmpty(normalizeStore(loaded))
}

export async function saveRwaStore(store: RwaStore): Promise<void> {
  const next = normalizeStore(store)
  if (kvConfigured()) {
    await kvCommand(['SET', KV_KEY, JSON.stringify(next)])
    return
  }
  if (process.env.VERCEL) {
    throw new AuthError(
      'En Vercel hace falta Vercel KV para persistir tokenizaciones.',
      503,
    )
  }
  mkdirSync(dirname(RWA_FILE), { recursive: true })
  writeFileSync(RWA_FILE, JSON.stringify(next, null, 2), 'utf8')
}

export async function createTokenizationRequest(input: {
  userId: string
  email: string
  publicKey: string
  payload: TokenizationWizardPayload
}): Promise<TokenizationRequest> {
  const store = await loadRwaStore()
  const now = new Date().toISOString()
  const request: TokenizationRequest = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    applicantUserId: input.userId,
    applicantEmail: input.email,
    applicantPublicKey: input.publicKey,
    assetName: input.payload.assetName.trim(),
    assetType: input.payload.assetType,
    estimatedValuationUsd: input.payload.estimatedValuationUsd,
    typeDetails: input.payload.typeDetails,
    legalGuarantee: input.payload.legalGuarantee,
    ownerLegalName: input.payload.ownerLegalName.trim(),
    ownerIdNumber: input.payload.ownerIdNumber.trim(),
    ownerCompany: input.payload.ownerCompany.trim(),
    documents: input.payload.documents,
    raiseAmountUsd: input.payload.raiseAmountUsd,
    expectedApy: input.payload.expectedApy,
    dividendFrequency: input.payload.dividendFrequency,
    status: 'pending_audit',
    rugmRegistration: '',
    legalContractHash: '',
    stellarAssetSpec: null,
    published: false,
    rejectionReason: '',
  }
  store.requests.unshift(request)
  await saveRwaStore(store)
  return request
}

export async function listRequestsForUser(
  userId: string,
  isAdmin: boolean,
): Promise<TokenizationRequest[]> {
  const store = await loadRwaStore()
  if (isAdmin) {
    return store.requests
  }
  return store.requests.filter((row) => row.applicantUserId === userId)
}

export async function updateTokenizationRequest(input: {
  id: string
  status?: TokenizationStatus
  rugmRegistration?: string
  legalContractHash?: string
  generateSpec?: boolean
  published?: boolean
  rejectionReason?: string
}): Promise<TokenizationRequest> {
  const store = await loadRwaStore()
  const request = store.requests.find((row) => row.id === input.id)
  if (!request) {
    throw new AuthError('No encontramos esa solicitud de tokenización', 404)
  }

  if (input.status) {
    request.status = input.status
  }
  if (input.rugmRegistration !== undefined) {
    request.rugmRegistration = input.rugmRegistration.trim()
  }
  if (input.legalContractHash !== undefined) {
    request.legalContractHash = input.legalContractHash.trim()
  }
  if (input.rejectionReason !== undefined) {
    request.rejectionReason = input.rejectionReason.trim()
  }
  if (input.generateSpec) {
    request.stellarAssetSpec = buildAssetSpec(store, request)
  }
  if (input.published !== undefined) {
    request.published = input.published
    if (input.published) {
      request.status = 'approved'
      if (!request.stellarAssetSpec) {
        request.stellarAssetSpec = buildAssetSpec(store, request)
      }
      upsertListing(store, request)
    }
  }

  request.updatedAt = new Date().toISOString()
  await saveRwaStore(store)
  return request
}

export async function listPublishedListings(): Promise<MarketplaceListing[]> {
  const store = await loadRwaStore()
  return store.listings.filter((row) => row.published)
}

export async function investInListing(input: {
  userId: string
  listingId: string
  amountUsd: string
  txHash?: string
}): Promise<{ listing: MarketplaceListing; holding: RwaHolding }> {
  const store = await loadRwaStore()
  const listing = store.listings.find((row) => row.id === input.listingId)
  if (!listing || !listing.published) {
    throw new AuthError('Esa oportunidad no está publicada', 404)
  }
  const amount = Number(input.amountUsd)
  const min = Number(listing.minInvestmentUsd)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AuthError('El monto de inversión no es válido', 400)
  }
  if (amount < min) {
    throw new AuthError(`La inversión mínima es ${listing.minInvestmentUsd} USDC`, 400)
  }

  listing.raisedUsd = String(Number(listing.raisedUsd) + amount)
  const holdings = store.holdings[input.userId] ?? []
  const existing = holdings.find((row) => row.listingId === listing.id)
  if (existing) {
    existing.investedUsd = String(Number(existing.investedUsd) + amount)
    existing.tokens = String(Number(existing.tokens) + amount)
    existing.lastInvestTxHash = input.txHash
  } else {
    holdings.push({
      listingId: listing.id,
      assetCode: listing.assetCode,
      tokens: String(amount),
      investedUsd: String(amount),
      claimedDividendsUsd: '0',
      lastInvestTxHash: input.txHash,
    })
  }
  store.holdings[input.userId] = holdings
  await saveRwaStore(store)
  const holding = holdings.find((row) => row.listingId === listing.id)!
  return { listing, holding }
}

export async function getPortfolio(userId: string): Promise<RwaHolding[]> {
  const store = await loadRwaStore()
  return store.holdings[userId] ?? []
}

export async function claimDividends(userId: string): Promise<RwaHolding[]> {
  const store = await loadRwaStore()
  const holdings = store.holdings[userId] ?? []
  const listings = store.listings
  for (const holding of holdings) {
    const listing = listings.find((row) => row.id === holding.listingId)
    const apy = Number(listing?.apy ?? 0) / 100
    const monthly = (Number(holding.investedUsd) * apy) / 12
    holding.claimedDividendsUsd = String(
      Number(holding.claimedDividendsUsd) + monthly,
    )
  }
  store.holdings[userId] = holdings
  await saveRwaStore(store)
  return holdings
}

export function findListing(
  store: RwaStore,
  listingId: string,
): MarketplaceListing | undefined {
  return store.listings.find((row) => row.id === listingId)
}

function buildAssetSpec(
  store: RwaStore,
  request: TokenizationRequest,
): StellarAssetSpec {
  const issuer = loyaltyAssetFromEnv().getIssuer() ?? 'GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW'
  const distribution = usdcAssetFromEnv().getIssuer() ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  const existingCodes = [
    ...store.listings.map((row) => row.assetCode),
    ...store.requests
      .map((row) => row.stellarAssetSpec?.assetCode)
      .filter((code): code is string => Boolean(code)),
  ]
  const assetCode =
    request.stellarAssetSpec?.assetCode ?? nextAssetCode(existingCodes)
  return {
    issuerPublicKey: issuer,
    distributionPublicKey: distribution,
    assetCode,
    totalSupply: request.raiseAmountUsd,
    metadata: {
      homeDomain: 'stellar-pay.local',
      legalGuarantee: request.legalGuarantee,
      rugmRegistration: request.rugmRegistration || undefined,
      legalContractHash: request.legalContractHash || undefined,
      notes: `${request.assetName} · ${request.assetType}`,
    },
  }
}

function nextAssetCode(existing: string[]): string {
  const nums = existing
    .map((code) => Number.parseInt(code.replace(/\D/g, ''), 10))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `RWA${String(next).padStart(2, '0')}`.slice(0, 12)
}

function upsertListing(store: RwaStore, request: TokenizationRequest) {
  const spec = request.stellarAssetSpec
  if (!spec) {
    return
  }
  const existing = store.listings.find((row) => row.requestId === request.id)
  const listing: MarketplaceListing = {
    id: existing?.id ?? randomUUID(),
    requestId: request.id,
    assetCode: spec.assetCode,
    name: request.assetName,
    assetType: request.assetType,
    apy: request.expectedApy,
    legalBacking: request.legalGuarantee,
    raisedUsd: existing?.raisedUsd ?? '0',
    targetUsd: request.raiseAmountUsd,
    minInvestmentUsd: existing?.minInvestmentUsd ?? '50',
    issuerPublicKey: spec.issuerPublicKey,
    distributionPublicKey: spec.distributionPublicKey,
    description: `${request.assetName} respaldado con ${request.legalGuarantee === 'rugm' ? 'garantía mobiliaria RUGM (Ley 9078)' : 'fideicomiso'} en Costa Rica.`,
    nextPayoutDate: existing?.nextPayoutDate ?? nextPayoutIso(request.dividendFrequency),
    totalSupply: spec.totalSupply,
    published: true,
    dividendFrequency: request.dividendFrequency,
  }
  if (existing) {
    Object.assign(existing, listing)
  } else {
    store.listings.unshift(listing)
  }
}

function nextPayoutIso(frequency: TokenizationRequest['dividendFrequency']): string {
  const date = new Date()
  date.setUTCDate(frequency === 'quarterly' ? date.getUTCDate() + 90 : 1)
  if (frequency === 'monthly') {
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return date.toISOString().slice(0, 10)
}

function seedIfEmpty(store: RwaStore): RwaStore {
  if (store.listings.length > 0) {
    return store
  }
  let issuer = 'GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW'
  let distribution = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  try {
    issuer = loyaltyAssetFromEnv().getIssuer() ?? issuer
    distribution = usdcAssetFromEnv().getIssuer() ?? distribution
  } catch {
    // keep demo keys
  }
  store.listings = [
    {
      id: 'listing-rwa01',
      requestId: null,
      assetCode: 'RWA01',
      name: 'Oficinas Plaza Escazú',
      assetType: 'renta_flujo_caja',
      apy: '8.5',
      legalBacking: 'rugm',
      raisedUsd: '185000',
      targetUsd: '400000',
      minInvestmentUsd: '100',
      issuerPublicKey: issuer,
      distributionPublicKey: distribution,
      description:
        'Participación en alquiler de oficinas clase A en San José. El flujo de alquiler se convierte a USDC y se distribuye a las wallets Stellar de los inversionistas.',
      nextPayoutDate: '2026-10-01',
      totalSupply: '400000',
      published: true,
      dividendFrequency: 'monthly',
    },
    {
      id: 'listing-rwa02',
      requestId: null,
      assetCode: 'RWA02',
      name: 'Flota de taxis Gran Área Metropolitana',
      assetType: 'renta_flujo_caja',
      apy: '11.0',
      legalBacking: 'fideicomiso',
      raisedUsd: '62000',
      targetUsd: '120000',
      minInvestmentUsd: '50',
      issuerPublicKey: issuer,
      distributionPublicKey: distribution,
      description:
        'Flota de vehículos productivos bajo fideicomiso. Las cuotas de arrendamiento se liquidan en USDC cada mes.',
      nextPayoutDate: '2026-10-01',
      totalSupply: '120000',
      published: true,
      dividendFrequency: 'monthly',
    },
    {
      id: 'listing-rwa03',
      requestId: null,
      assetCode: 'RWA03',
      name: 'Factoring PYME — cadenas de supermercado',
      assetType: 'renta_flujo_caja',
      apy: '14.0',
      legalBacking: 'rugm',
      raisedUsd: '41000',
      targetUsd: '80000',
      minInvestmentUsd: '50',
      issuerPublicKey: issuer,
      distributionPublicKey: distribution,
      description:
        'Cartera de facturas de pymes costarricenses con cesión y registro RUGM. El cobro se distribuye en USDC a los tenedores del token.',
      nextPayoutDate: '2026-10-01',
      totalSupply: '80000',
      published: true,
      dividendFrequency: 'monthly',
    },
  ]
  return store
}

function emptyStore(): RwaStore {
  return { requests: [], listings: [], holdings: {} }
}

function normalizeStore(store: RwaStore): RwaStore {
  return {
    requests: (store.requests ?? []).map(normalizeRequest),
    listings: (store.listings ?? []).map(normalizeListing),
    holdings: store.holdings ?? {},
  }
}

function normalizeRequest(row: TokenizationRequest): TokenizationRequest {
  const assetType = coerceAssetType(row.assetType)
  return {
    ...row,
    assetType,
    typeDetails:
      row.typeDetails && row.typeDetails.kind === assetType
        ? row.typeDetails
        : emptyTypeDetails(assetType),
    documents: Array.isArray(row.documents) ? row.documents : [],
  }
}

function normalizeListing(row: MarketplaceListing): MarketplaceListing {
  return {
    ...row,
    assetType: coerceAssetType(row.assetType),
    dividendFrequency: row.dividendFrequency === 'quarterly' ? 'quarterly' : 'monthly',
  }
}

function coerceAssetType(value: string): RwaAssetType {
  if (
    value === 'equity_inmobiliario' ||
    value === 'renta_flujo_caja' ||
    value === 'uso_fraccionado' ||
    value === 'agricola_exportacion' ||
    value === 'creditos_carbono'
  ) {
    return value
  }
  if (value === 'inmueble') {
    return 'equity_inmobiliario'
  }
  return 'renta_flujo_caja'
}

function emptyTypeDetails(assetType: RwaAssetType): TokenizationTypeDetails {
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

async function readStore(): Promise<RwaStore> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | RwaStore | null>(['GET', KV_KEY])
    if (!raw) {
      return emptyStore()
    }
    if (typeof raw === 'string') {
      return JSON.parse(raw) as RwaStore
    }
    return raw
  }
  if (process.env.VERCEL) {
    return emptyStore()
  }
  if (!existsSync(RWA_FILE)) {
    return emptyStore()
  }
  return JSON.parse(readFileSync(RWA_FILE, 'utf8')) as RwaStore
}

function kvConfigured(): boolean {
  return Boolean(kvUrl() && kvToken())
}

function kvUrl(): string {
  return stripQuotes(
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '',
  )
}

function kvToken(): string {
  return stripQuotes(
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  )
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    throw new AuthError('No se pudo acceder al almacén KV de RWA', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
