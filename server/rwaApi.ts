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
  return {
    assetName: name,
    assetType,
    estimatedValuationUsd: requireAmount(body.estimatedValuationUsd, 'valuación'),
    legalGuarantee,
    ownerLegalName: String(body.ownerLegalName ?? '').trim(),
    ownerIdNumber: String(body.ownerIdNumber ?? '').trim(),
    ownerCompany: String(body.ownerCompany ?? '').trim(),
    documents: parseDocuments(body.documents),
    raiseAmountUsd: requireAmount(body.raiseAmountUsd, 'monto a levantar'),
    expectedApy: requireAmount(body.expectedApy, 'rendimiento'),
    dividendFrequency: frequency,
  }
}

function isAssetType(
  value: string,
): value is TokenizationWizardPayload['assetType'] {
  return (
    value === 'inmueble' ||
    value === 'vehiculo' ||
    value === 'factura' ||
    value === 'flujo_caja'
  )
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
      const allowed = ['titulo', 'estados_financieros', 'identificacion', 'otro'] as const
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
