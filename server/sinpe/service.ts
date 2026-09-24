import { randomUUID } from 'node:crypto'
import {
  ensureUserLoyaltyTrustline,
  ensureUserSinpeCode,
  findUserByEmail,
  findUserById,
  findUserByPublicKey,
  findUserBySinpeCode,
  type PublicUser,
} from '../auth.js'
import {
  codeMatchesPublicKey,
  extractSinpeCodes,
  formatSinpePhone,
  normalizeSinpeCode,
  sinpeReceivePhone,
} from './code.js'
import { AuthError } from '../errors.js'
import { creditLoyaltyFromTreasury } from '../submitPayment.js'
import { calculateRojos, formatRojosAmount } from './convert.js'
import { extractStellarPublicKey, extractPhoneFromSms, parseSinpeSms } from './parseSms.js'
import {
  isTemplatePlaceholder,
  isRouteNoise,
  looksTruncatedSinpeSms,
} from './webhookPayload.js'
import {
  findByMessageQuery,
  findByReference,
  listUnassignedDeposits,
  listSinpeForUser,
  upsertSinpeTransaction,
  upsertUnassignedDeposit,
} from './store.js'
import type { UnassignedDeposit } from './types.js'

type WebhookPayload = {
  sender: string
  message: string
  timestamp: number
}

export async function getSinpeIntent(session: PublicUser) {
  const user = await ensureUserSinpeCode(session.id)
  if (!user?.sinpeCode) {
    throw new AuthError('No se pudo crear el código SINPE', 500)
  }
  const phone = sinpeReceivePhone()
  return {
    phone,
    phoneDisplay: formatSinpePhone(phone),
    code: user.sinpeCode,
    publicKey: user.publicKey,
  }
}

export async function processSinpeSmsWebhook(payload: WebhookPayload) {
  const sender = resolveSender(payload.sender, payload.message)
  const parsed = parseSinpeSms(payload.message)
  if (!parsed) {
    const now = new Date().toISOString()
    const codes = extractSinpeCodes(payload.message)
    const destination = codes[0]
      ? await findUserBySinpeCode(codes[0])
      : undefined
    const matched =
      destination && codeMatchesPublicKey(codes[0] ?? '', destination.publicKey)
        ? destination
        : undefined
    const deposit = await upsertUnassignedDeposit({
      id: randomUUID(),
      referenceId: `unparsed-${Date.now()}`,
      crcAmount: 0,
      calculatedRojos: 0,
      promoApplied: false,
      comment: codes[0] ?? '',
      sender,
      rawMessage: isRouteNoise(payload.message) ? '' : payload.message,
      timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
      status: 'PENDING_MANUAL_MATCH',
      lastError: webhookEmptyError(payload.message),
      assignedUserId: matched?.id,
      assignedPublicKey: matched?.publicKey,
      createdAt: now,
      updatedAt: now,
    })
    return {
      status: 'pending_manual_match' as const,
      deposit,
      error: 'SMS no reconocido',
    }
  }

  const existing = await findByReference(parsed.referenceId)
  if (existing.transaction?.status === 'COMPLETED' || isResolved(existing.deposit)) {
    return { status: 'duplicate_ignored' as const }
  }
  if (
    existing.deposit?.status === 'PENDING_MANUAL_MATCH' &&
    !existing.transaction &&
    !isRicherSms(payload.message, existing.deposit.rawMessage)
  ) {
    return { status: 'duplicate_ignored' as const }
  }

  const { rojos, promoApplied } = calculateRojos(parsed.crcAmount)
  const destination = await resolveDestination(parsed.comment, payload.message)
  const now = new Date().toISOString()
  const timestamp = Number.isFinite(payload.timestamp)
    ? payload.timestamp
    : Date.now()

  if (!destination) {
    const deposit = await upsertUnassignedDeposit({
      id: existing.deposit?.id ?? randomUUID(),
      referenceId: parsed.referenceId,
      crcAmount: parsed.crcAmount,
      calculatedRojos: rojos,
      promoApplied,
      comment: parsed.comment,
      sender,
      rawMessage: payload.message,
      timestamp,
      status: 'PENDING_MANUAL_MATCH',
      lastError: destinationError(parsed.comment, payload.message),
      createdAt: existing.deposit?.createdAt ?? now,
      updatedAt: now,
    })
    return {
      status: 'pending_manual_match' as const,
      deposit,
      calculatedRojos: rojos,
      promoApplied,
    }
  }

  try {
    const credit = await mintRojosToUser(destination, rojos, parsed.referenceId)
    const notification = successMessage(rojos)
    const transaction = await upsertSinpeTransaction({
      id: existing.transaction?.id ?? randomUUID(),
      referenceId: parsed.referenceId,
      crcAmount: parsed.crcAmount,
      calculatedRojos: rojos,
      promoApplied,
      comment: parsed.comment,
      sender,
      rawMessage: payload.message,
      timestamp,
      status: 'COMPLETED',
      userId: destination.id,
      publicKey: destination.publicKey,
      stellarHash: credit.hash,
      notification,
      createdAt: existing.transaction?.createdAt ?? now,
      updatedAt: now,
    })
    return {
      status: 'completed' as const,
      transaction,
      notification,
    }
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'No se pudo acreditar'
    const deposit = await upsertUnassignedDeposit({
      id: existing.deposit?.id ?? randomUUID(),
      referenceId: parsed.referenceId,
      crcAmount: parsed.crcAmount,
      calculatedRojos: rojos,
      promoApplied,
      comment: parsed.comment,
      sender,
      rawMessage: payload.message,
      timestamp,
      status: 'PENDING_MANUAL_MATCH',
      lastError,
      assignedUserId: destination.id,
      assignedPublicKey: destination.publicKey,
      createdAt: existing.deposit?.createdAt ?? now,
      updatedAt: now,
    })
    return {
      status: 'pending_manual_match' as const,
      deposit,
      calculatedRojos: rojos,
      promoApplied,
      error: lastError,
    }
  }
}

export async function assignUnassignedDeposit(input: {
  referenceId: string
  userId: string
  adminId: string
  crcAmount?: number
}) {
  requireReference(input.referenceId)
  if (!input.userId.trim()) {
    throw new AuthError('Selecciona un usuario', 400)
  }
  const { deposit, transaction } = await findByReference(input.referenceId)
  if (transaction?.status === 'COMPLETED' || isResolved(deposit)) {
    throw new AuthError('Este comprobante ya fue acreditado', 409)
  }
  if (!deposit || deposit.status !== 'PENDING_MANUAL_MATCH') {
    throw new AuthError('No hay un depósito pendiente con ese comprobante', 404)
  }
  let ready = withParsedAmounts(deposit)
  const crcOverride = input.crcAmount
  if (crcOverride != null && Number.isFinite(crcOverride) && crcOverride > 0) {
    const { rojos, promoApplied } = calculateRojos(crcOverride)
    ready = {
      ...ready,
      crcAmount: crcOverride,
      calculatedRojos: rojos,
      promoApplied,
    }
  }
  if (!(ready.calculatedRojos > 0)) {
    throw new AuthError('Indica el monto en colones de este SMS para acreditar', 400)
  }
  const user = await requireAssignableUser(input.userId)
  const credit = await mintRojosToUser(user, ready.calculatedRojos, ready.referenceId)
  const now = new Date().toISOString()
  const resolved = await upsertUnassignedDeposit({
    ...ready,
    status: 'RESOLVED',
    assignedUserId: user.id,
    assignedPublicKey: user.publicKey,
    stellarHash: credit.hash,
    resolvedByAdminId: input.adminId,
    resolvedAt: now,
    lastError: undefined,
    updatedAt: now,
  })
  const completed = await upsertSinpeTransaction({
    id: transaction?.id ?? randomUUID(),
    referenceId: ready.referenceId,
    crcAmount: ready.crcAmount,
    calculatedRojos: ready.calculatedRojos,
    promoApplied: ready.promoApplied,
    comment: ready.comment,
    sender: ready.sender,
    rawMessage: ready.rawMessage,
    timestamp: ready.timestamp,
    status: 'COMPLETED',
    userId: user.id,
    publicKey: user.publicKey,
    stellarHash: credit.hash,
    notification: successMessage(ready.calculatedRojos),
    createdAt: transaction?.createdAt ?? now,
    updatedAt: now,
  })
  return { deposit: resolved, transaction: completed }
}

export async function retryMySinpeCredits(userId: string) {
  const { deposits } = await listSinpeForUser(userId)
  const pending = deposits.filter(
    (row) => row.status === 'PENDING_MANUAL_MATCH' && row.assignedUserId === userId,
  )
  const results = []
  for (const deposit of pending) {
    try {
      const user = await requireAssignableUser(userId)
      const ready = withParsedAmounts(deposit)
      const credit = await mintRojosToUser(
        user,
        ready.calculatedRojos,
        ready.referenceId,
      )
      const now = new Date().toISOString()
      await upsertUnassignedDeposit({
        ...ready,
        status: 'RESOLVED',
        stellarHash: credit.hash,
        lastError: undefined,
        resolvedAt: now,
        updatedAt: now,
      })
      await upsertSinpeTransaction({
        id: randomUUID(),
        referenceId: ready.referenceId,
        crcAmount: ready.crcAmount,
        calculatedRojos: ready.calculatedRojos,
        promoApplied: ready.promoApplied,
        comment: ready.comment,
        sender: ready.sender,
        rawMessage: ready.rawMessage,
        timestamp: ready.timestamp,
        status: 'COMPLETED',
        userId,
        publicKey: user.publicKey,
        stellarHash: credit.hash,
        notification: successMessage(ready.calculatedRojos),
        createdAt: now,
        updatedAt: now,
      })
      results.push({ referenceId: ready.referenceId, ok: true, hash: credit.hash })
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'No se pudo acreditar'
      await upsertUnassignedDeposit({
        ...deposit,
        lastError,
        updatedAt: new Date().toISOString(),
      })
      results.push({ referenceId: deposit.referenceId, ok: false, error: lastError })
    }
  }
  return { results }
}

export async function claimSinpeDeposit(input: {
  referenceId: string
  user: PublicUser
}) {
  requireReference(input.referenceId)
  const { deposit, transaction } = await findByReference(input.referenceId)
  if (transaction?.status === 'COMPLETED' || isResolved(deposit)) {
    const sameAccount =
      transaction?.userId === input.user.id ||
      deposit?.assignedUserId === input.user.id ||
      transaction?.publicKey === input.user.publicKey ||
      deposit?.assignedPublicKey === input.user.publicKey
    throw new AuthError(
      sameAccount
        ? 'Este comprobante ya fue aceptado y los ROJOS ya están en tu cuenta.'
        : 'Este número de transacción ya fue usado y no se puede acreditar de nuevo.',
      409,
      sameAccount ? 'already_credited' : 'already_used',
    )
  }
  if (!deposit || deposit.status !== 'PENDING_MANUAL_MATCH') {
    throw new AuthError(
      'Ese número no coincide con ningún comprobante que hayamos recibido. Revisa el número o espera unos minutos si acabas de transferir.',
      404,
      'not_found',
    )
  }
  if (belongsToAnotherAccount(deposit, input.user)) {
    throw new AuthError(
      'El código de esa transacción no coincide con tu cuenta.',
      403,
      'code_mismatch',
    )
  }
  const ready = withParsedAmounts(deposit)
  if (!(ready.calculatedRojos > 0)) {
    throw new AuthError(
      'Recibimos ese comprobante, pero no pudimos leer el monto. Pide en la mesa SINPE que lo acrediten.',
      422,
      'amount_unknown',
    )
  }
  const user = await requireAssignableUser(input.user.id)
  let credit: { hash: string }
  try {
    credit = await mintRojosToUser(user, ready.calculatedRojos, ready.referenceId)
  } catch (error) {
    const lastError = error instanceof Error ? error.message : 'No se pudo acreditar'
    await upsertUnassignedDeposit({
      ...ready,
      lastError,
      updatedAt: new Date().toISOString(),
    })
    throw new AuthError(
      'No se pudo acreditar el comprobante a tu cuenta. Intenta de nuevo o avisa en la mesa SINPE.',
      502,
      'credit_failed',
    )
  }
  const now = new Date().toISOString()
  const message = `Se aceptó el comprobante y se acreditaron ${formatRojosDisplay(ready.calculatedRojos)} ROJOS a tu cuenta.`
  const resolved = await upsertUnassignedDeposit({
    ...ready,
    status: 'RESOLVED_BY_USER_CLAIM',
    assignedUserId: user.id,
    assignedPublicKey: user.publicKey,
    stellarHash: credit.hash,
    resolvedAt: now,
    lastError: undefined,
    updatedAt: now,
  })
  await upsertSinpeTransaction({
    id: transaction?.id ?? randomUUID(),
    referenceId: ready.referenceId,
    crcAmount: ready.crcAmount,
    calculatedRojos: ready.calculatedRojos,
    promoApplied: ready.promoApplied,
    comment: ready.comment,
    sender: ready.sender,
    rawMessage: ready.rawMessage,
    timestamp: ready.timestamp,
    status: 'COMPLETED',
    userId: user.id,
    publicKey: user.publicKey,
    stellarHash: credit.hash,
    notification: message,
    createdAt: transaction?.createdAt ?? now,
    updatedAt: now,
  })
  return {
    outcome: 'credited' as const,
    message,
    deposit: resolved,
    rojos: ready.calculatedRojos,
    stellarHash: credit.hash,
  }
}

export async function lookupSinpeClaim(referenceId: string) {
  requireReference(referenceId)
  let found = await findByReference(referenceId)
  if (!found.deposit && !found.transaction) {
    found = await findByMessageQuery(referenceId)
  }
  if (!found.deposit && !found.transaction) {
    throw new AuthError('Comprobante no encontrado', 404)
  }
  return {
    deposit: found.deposit ? withParsedAmounts(found.deposit) : found.deposit,
    transaction: found.transaction,
  }
}

export function listPendingDeposits(query?: string) {
  return listUnassignedDeposits({
    query,
    status: query ? 'ALL' : 'PENDING_MANUAL_MATCH',
  }).then((rows) => rows.map(withParsedAmounts))
}

async function mintRojosToUser(
  user: { id?: string; publicKey: string },
  rojos: number,
  referenceId: string,
) {
  if (user.id) {
    await ensureUserLoyaltyTrustline(user.id)
  }
  return creditLoyaltyFromTreasury({
    destination: user.publicKey,
    amount: formatRojosAmount(rojos),
    memo: `SINPE ${referenceId}`.slice(0, 28),
  })
}

async function resolveDestination(
  comment: string,
  rawMessage?: string,
): Promise<{ id?: string; publicKey: string } | undefined> {
  for (const sinpeCode of extractSinpeCodes(comment, rawMessage ?? '')) {
    const byCode = await findUserBySinpeCode(sinpeCode)
    if (
      byCode &&
      (codeMatchesPublicKey(sinpeCode, byCode.publicKey) ||
        normalizeSinpeCode(byCode.sinpeCode ?? '') === normalizeSinpeCode(sinpeCode))
    ) {
      return byCode
    }
  }
  const publicKey = extractStellarPublicKey(comment)
  if (publicKey) {
    const byKey = await findUserByPublicKey(publicKey)
    return { id: byKey?.id, publicKey }
  }
  const emailMatch = comment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (emailMatch?.[0]) {
    const byEmail = await findUserByEmail(emailMatch[0])
    if (byEmail) {
      return byEmail
    }
  }
  const idMatch = comment.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  )
  if (idMatch?.[0]) {
    const byId = await findUserById(idMatch[0])
    if (byId) {
      return byId
    }
  }
  return undefined
}

function webhookEmptyError(message: string): string {
  if (isTemplatePlaceholder(message) || isRouteNoise(message) || !message.trim()) {
    return 'El POST llegó, pero no trajo el texto del SMS. En Forwarder el JSON debe usar "text": "%text%" y hay que guardar la regla. No uses el nombre de la ruta.'
  }
  if (looksTruncatedSinpeSms(message)) {
    return 'El SMS llegó cortado. En el celular usá POST JSON (no GET), el token %text% completo (no %Regex%) y reenviá el mensaje entero.'
  }
  return 'SMS no reconocido (monto o referencia). El mensaje se guardó completo.'
}

function destinationError(comment: string, message: string): string {
  if (looksTruncatedSinpeSms(message) && !extractSinpeCodes(message)[0]) {
    return 'El SMS llegó cortado y no trae el código sc…ts de la cuenta. Forwarder tiene que mandar el mensaje entero (POST, %text%, sin Regex). El depósito corto no se acredita solo.'
  }
  if (comment) {
    return `No hay cuenta con el código de la nota (${comment})`
  }
  return 'La nota del SINPE no trajo el código sc…ts'
}

function isRicherSms(next: string, prev: string): boolean {
  const previous = prev.trim()
  if (!previous) {
    return Boolean(next.trim())
  }
  const nextCodes = extractSinpeCodes(next).length
  const prevCodes = extractSinpeCodes(previous).length
  if (nextCodes > prevCodes) {
    return true
  }
  return next.trim().length > previous.length + 5
}

async function requireAssignableUser(userId: string) {
  const user = await findUserById(userId)
  if (!user) {
    throw new AuthError('El usuario no existe', 404)
  }
  if (user.role !== 'customer' && user.role !== 'merchant') {
    throw new AuthError('Esa cuenta no puede recibir recargas', 400)
  }
  return user
}

export function withParsedAmounts(deposit: UnassignedDeposit): UnassignedDeposit {
  if (deposit.crcAmount > 0 && deposit.calculatedRojos > 0) {
    return deposit
  }
  const parsed = parseSinpeSms(deposit.rawMessage)
  if (!parsed) {
    return deposit
  }
  const { rojos, promoApplied } = calculateRojos(parsed.crcAmount)
  return {
    ...deposit,
    crcAmount: parsed.crcAmount,
    calculatedRojos: rojos,
    promoApplied,
    comment: parsed.comment || deposit.comment,
  }
}

function resolveSender(sender: string, message: string): string {
  const raw = sender.trim()
  const placeholder = /^\{.+\}$/.test(raw) || raw.toLowerCase() === 'from'
  if (raw && !placeholder) {
    return raw
  }
  return extractPhoneFromSms(message) ?? raw
}

function requireReference(referenceId: string) {
  if (!referenceId.trim()) {
    throw new AuthError('Indica el número de comprobante', 400, 'missing_reference')
  }
}

function belongsToAnotherAccount(
  deposit: UnassignedDeposit,
  user: PublicUser,
): boolean {
  if (deposit.assignedUserId && deposit.assignedUserId !== user.id) {
    return true
  }
  return Boolean(
    deposit.assignedPublicKey && deposit.assignedPublicKey !== user.publicKey,
  )
}

function isResolved(deposit?: UnassignedDeposit) {
  return (
    deposit?.status === 'RESOLVED' || deposit?.status === 'RESOLVED_BY_USER_CLAIM'
  )
}

function successMessage(rojos: number) {
  return `¡Recarga exitosa! Se han acreditado ${formatRojosDisplay(rojos)} ROJOS en tu billetera`
}

function formatRojosDisplay(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}
