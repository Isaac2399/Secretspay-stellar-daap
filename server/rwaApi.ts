import { StrKey } from '@stellar/stellar-sdk'
import { AuthError } from './errors.js'
import { secretKeyForUser, userFromCookieHeader } from './auth.js'
import { requireSuperAdmin } from './superAdmin.js'
import { ensureClassicAssetTrustline } from './provisionAccount.js'
import { submitCustodialPayment } from './submitPayment.js'
import {
  claimDividends,
  createTokenizationRequest,
  getPortfolio,
  investInListing,
  listPublishedListings,
  listRequestsForUser,
  loadRwaStore,
  updateTokenizationRequest,
  type TokenizationWizardPayload,
} from './rwaStore.js'

type ApiInput = {
  method: string
  path: string
  cookie?: string
  body: Record<string, unknown>
}

type ApiResult = { status: number; body: unknown; setCookie?: string }

export async function handleRwaRoutes(
  input: ApiInput,
): Promise<ApiResult | null> {
  const path = (input.path.split('?')[0] ?? input.path).replace(/\/$/, '') || '/'
  if (!path.startsWith('/api/rwa')) {
    return null
  }

  const session = await userFromCookieHeader(input.cookie)
  if (!session?.id) {
    throw new AuthError('No hay sesión', 401)
  }

  const method = input.method.toUpperCase()
  const isAdmin = session.role === 'admin'

  if (method === 'GET' && (path === '/api/rwa/listings' || path === '/api/rwa')) {
    return { status: 200, body: { listings: await listPublishedListings() } }
  }

  if (method === 'GET' && path === '/api/rwa/requests') {
    return {
      status: 200,
      body: { requests: await listRequestsForUser(session.id, isAdmin) },
    }
  }

  if (method === 'POST' && path === '/api/rwa/requests') {
    const payload = parseWizardPayload(input.body)
    const request = await createTokenizationRequest({
      userId: session.id,
      email: session.email,
      publicKey: session.publicKey,
      payload,
    })
    return { status: 201, body: { request } }
  }

  if (method === 'PATCH' && path === '/api/rwa/requests') {
    await requireSuperAdmin(session)
    const id = String(input.body.id ?? '')
    if (!id) {
      throw new AuthError('Falta el id de la solicitud', 400)
    }
    const request = await updateTokenizationRequest({
      id,
      status: optionalStatus(input.body.status),
      rugmRegistration: optionalString(input.body.rugmRegistration),
      legalContractHash: optionalString(input.body.legalContractHash),
      generateSpec: Boolean(input.body.generateSpec),
      published: optionalBoolean(input.body.published),
      rejectionReason: optionalString(input.body.rejectionReason),
    })
    return { status: 200, body: { request } }
  }

  if (method === 'GET' && path === '/api/rwa/portfolio') {
    return { status: 200, body: { holdings: await getPortfolio(session.id) } }
  }

  if (method === 'POST' && path === '/api/rwa/claim') {
    const holdings = await claimDividends(session.id)
    return { status: 200, body: { holdings } }
  }

  if (method === 'POST' && path === '/api/rwa/trustline') {
    const listingId = String(input.body.listingId ?? '')
    const store = await loadRwaStore()
    const listing = store.listings.find((row) => row.id === listingId)
    if (!listing) {
      throw new AuthError('No encontramos esa emisión', 404)
    }
    await ensureClassicAssetTrustline(
      await secretKeyForUser(session.id),
      listing.assetCode,
      listing.issuerPublicKey,
    )
    return { status: 200, body: { ok: true, assetCode: listing.assetCode } }
  }

  if (method === 'POST' && path === '/api/rwa/invest') {
    const listingId = String(input.body.listingId ?? '')
    const amount = String(input.body.amount ?? '')
    const store = await loadRwaStore()
    const listing = store.listings.find((row) => row.id === listingId)
    if (!listing || !listing.published) {
      throw new AuthError('Esa oportunidad no está publicada', 404)
    }

    await ensureClassicAssetTrustline(
      await secretKeyForUser(session.id),
      listing.assetCode,
      listing.issuerPublicKey,
    )

    const memo = `INV-${listing.assetCode}`.slice(0, 28)
    let txHash: string | undefined
    if (StrKey.isValidEd25519PublicKey(listing.distributionPublicKey)) {
      const result = await submitCustodialPayment({
        userId: session.id,
        destination: listing.distributionPublicKey,
        amount,
        asset: 'USDC',
        memo,
      })
      txHash = result.hash
    }

    const invested = await investInListing({
      userId: session.id,
      listingId,
      amountUsd: amount,
      txHash,
    })
    return { status: 200, body: { ...invested, txHash } }
  }

  return { status: 404, body: { error: 'Ruta RWA no encontrada' } }
}

function parseWizardPayload(body: Record<string, unknown>): TokenizationWizardPayload {
  const assetType = String(body.assetType ?? '')
  const legalGuarantee = String(body.legalGuarantee ?? '')
  const frequency = String(body.dividendFrequency ?? '')
  if (!isAssetType(assetType)) {
    throw new AuthError('Seleccione un tipo de activo válido', 400)
  }
  if (legalGuarantee !== 'rugm' && legalGuarantee !== 'fideicomiso') {
    throw new AuthError('Seleccione el tipo de respaldo legal', 400)
  }
  if (frequency !== 'monthly' && frequency !== 'quarterly') {
    throw new AuthError('Seleccione la frecuencia de dividendos', 400)
  }
  const name = String(body.assetName ?? '').trim()
  if (name.length < 3) {
    throw new AuthError('Indique el nombre del activo', 400)
  }
  const documents = parseDocuments(body.documents)
  const typeDetails = parseTypeDetails(assetType, body.typeDetails, documents)
  return {
    assetName: name,
    assetType,
    estimatedValuationUsd: requireAmount(body.estimatedValuationUsd, 'valuación'),
    typeDetails,
    legalGuarantee,
    ownerLegalName: String(body.ownerLegalName ?? '').trim(),
    ownerIdNumber: String(body.ownerIdNumber ?? '').trim(),
    ownerCompany: String(body.ownerCompany ?? '').trim(),
    documents,
    raiseAmountUsd: requireAmount(body.raiseAmountUsd, 'monto a levantar'),
    expectedApy: requireAmount(body.expectedApy, 'rendimiento'),
    dividendFrequency: frequency,
  }
}

function isAssetType(
  value: string,
): value is TokenizationWizardPayload['assetType'] {
  return (
    value === 'equity_inmobiliario' ||
    value === 'renta_flujo_caja' ||
    value === 'uso_fraccionado' ||
    value === 'agricola_exportacion' ||
    value === 'creditos_carbono'
  )
}

function parseTypeDetails(
  assetType: TokenizationWizardPayload['assetType'],
  value: unknown,
  documents: TokenizationWizardPayload['documents'],
): TokenizationWizardPayload['typeDetails'] {
  const row =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const hasDoc = (kind: TokenizationWizardPayload['documents'][number]['kind']) =>
    documents.some((item) => item.kind === kind && item.fileName.trim().length > 0)

  if (assetType === 'equity_inmobiliario') {
    const projectPhase = String(row.projectPhase ?? '')
    if (
      projectPhase !== 'en_plano' &&
      projectPhase !== 'en_construccion' &&
      projectPhase !== 'finalizado'
    ) {
      throw new AuthError('Seleccione la fase del proyecto', 400)
    }
    const estimatedStartDate = String(row.estimatedStartDate ?? '').trim()
    const estimatedDeliveryDate = String(row.estimatedDeliveryDate ?? '').trim()
    if (!estimatedStartDate || !estimatedDeliveryDate) {
      throw new AuthError('Indique las fechas estimadas de inicio y entrega', 400)
    }
    if (estimatedDeliveryDate < estimatedStartDate) {
      throw new AuthError('La fecha de entrega no puede ser anterior al inicio', 400)
    }
    const exitStrategy = String(row.exitStrategy ?? '').trim()
    if (exitStrategy.length < 8) {
      throw new AuthError('Describa la estrategia de salida / liquidación del capital', 400)
    }
    if (!hasDoc('permisos_viabilidad')) {
      throw new AuthError(
        'Adjunte los permisos de viabilidad/construcción (SETENA / Municipalidad)',
        400,
      )
    }
    return {
      kind: 'equity_inmobiliario',
      projectPhase,
      estimatedStartDate,
      estimatedDeliveryDate,
      exitStrategy,
    }
  }

  if (assetType === 'renta_flujo_caja') {
    if (!hasDoc('historico_ocupacion')) {
      throw new AuthError(
        'Adjunte el histórico de ocupación o los contratos de arrendamiento vigentes',
        400,
      )
    }
    const operatingExpenses = String(row.operatingExpenses ?? '').trim()
    if (!operatingExpenses) {
      throw new AuthError('Indique el porcentaje o monto estimado de gastos operativos', 400)
    }
    const apyBasis = String(row.apyBasis ?? '')
    if (apyBasis !== 'bruto' && apyBasis !== 'neto') {
      throw new AuthError('Indique si el APY es bruto o neto', 400)
    }
    return {
      kind: 'renta_flujo_caja',
      operatingExpenses,
      apyBasis,
    }
  }

  if (assetType === 'uso_fraccionado') {
    const highSeasonDays = String(row.highSeasonDays ?? '').trim()
    const midSeasonDays = String(row.midSeasonDays ?? '').trim()
    const lowSeasonDays = String(row.lowSeasonDays ?? '').trim()
    if (!highSeasonDays || !midSeasonDays || !lowSeasonDays) {
      throw new AuthError(
        'Complete la matriz de días asignados por token (alta, media y baja temporada)',
        400,
      )
    }
    const annualMaintenanceUsd = requireAmount(
      row.annualMaintenanceUsd,
      'cuota de mantenimiento anual por token',
    )
    const subletRules = String(row.subletRules ?? '').trim()
    if (subletRules.length < 8) {
      throw new AuthError(
        'Describa las reglas de subarriendo o acumulación de días no usados',
        400,
      )
    }
    return {
      kind: 'uso_fraccionado',
      highSeasonDays,
      midSeasonDays,
      lowSeasonDays,
      annualMaintenanceUsd,
      subletRules,
    }
  }

  if (assetType === 'agricola_exportacion') {
    const cropType = String(row.cropType ?? '').trim()
    const cropVariety = String(row.cropVariety ?? '').trim()
    const certifications = String(row.certifications ?? '').trim()
    if (cropType.length < 2 || cropVariety.length < 2) {
      throw new AuthError('Indique el tipo de cultivo y la variedad específica', 400)
    }
    if (certifications.length < 2) {
      throw new AuthError('Indique las certificaciones aplicables', 400)
    }
    if (!hasDoc('offtake_agreement')) {
      throw new AuthError(
        'Adjunte el contrato de compraventa o carta de intención internacional (Offtake)',
        400,
      )
    }
    const hectaresInProduction = requireAmount(
      row.hectaresInProduction,
      'hectáreas en producción',
    )
    const agriculturalInsurance = String(row.agriculturalInsurance ?? '').trim()
    if (agriculturalInsurance.length < 3) {
      throw new AuthError('Indique el seguro agrícola', 400)
    }
    if (!hasDoc('plano_catastrado')) {
      throw new AuthError('Adjunte el plano catastrado / respaldo de hectáreas y seguro', 400)
    }
    return {
      kind: 'agricola_exportacion',
      cropType,
      cropVariety,
      certifications,
      hectaresInProduction,
      agriculturalInsurance,
    }
  }

  const certificationStandard = String(row.certificationStandard ?? '').trim()
  if (certificationStandard.length < 3) {
    throw new AuthError('Indique el estándar o metodología de certificación', 400)
  }
  if (!hasDoc('mrv_auditoria')) {
    throw new AuthError('Adjunte el documento de auditoría/verificación MRV', 400)
  }
  const vintageYear = String(row.vintageYear ?? '').trim()
  if (!/^\d{4}$/.test(vintageYear)) {
    throw new AuthError('Indique el año de acreditación (Vintage Year) con 4 dígitos', 400)
  }
  const year = Number(vintageYear)
  const maxYear = new Date().getFullYear() + 2
  if (year < 1990 || year > maxYear) {
    throw new AuthError('El año de acreditación está fuera de un rango válido', 400)
  }
  return {
    kind: 'creditos_carbono',
    certificationStandard,
    vintageYear,
  }
}

function requireAmount(value: unknown, label: string): string {
  const raw = String(value ?? '').trim()
  if (!/^\d+(\.\d{1,7})?$/.test(raw) || Number(raw) <= 0) {
    throw new AuthError(`El campo de ${label} no es válido`, 400)
  }
  return raw
}

function parseDocuments(value: unknown): TokenizationWizardPayload['documents'] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const row = item as Record<string, unknown>
      const fileName = String(row.fileName ?? '').trim()
      const kind = String(row.kind ?? 'otro')
      if (!fileName) {
        return null
      }
      const allowed = [
        'titulo',
        'estados_financieros',
        'identificacion',
        'otro',
        'permisos_viabilidad',
        'historico_ocupacion',
        'offtake_agreement',
        'plano_catastrado',
        'mrv_auditoria',
      ] as const
      const matched = allowed.find((entry) => entry === kind) ?? 'otro'
      return { kind: matched, fileName }
    })
    .filter((row): row is TokenizationWizardPayload['documents'][number] => row !== null)
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return String(value)
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined
  }
  return Boolean(value)
}

function optionalStatus(
  value: unknown,
): 'pending_audit' | 'legal_review' | 'approved' | 'rejected' | undefined {
  const status = String(value ?? '')
  if (
    status === 'pending_audit' ||
    status === 'legal_review' ||
    status === 'approved' ||
    status === 'rejected'
  ) {
    return status
  }
  return undefined
}
