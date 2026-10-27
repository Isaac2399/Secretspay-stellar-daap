import { randomUUID } from 'node:crypto'
import {
  ensureUserLoyaltyTrustline,
  ensureUserSinpeCode,
  findUserByEmail,
  findUserById,
  findUserByPublicKey,
  findUserBySinpeCode,
  setUserSinpeCode,
  toPublicUser,
  type PublicUser,
  type StoredUser,
} from '../auth.js'
import {
  codeMatchesPublicKey,
  extractSinpeCodes,
  formatSinpePhone,
  isAllowedSinpeSender,
  mintEphemeralSinpeCode,
  normalizeSinpeCode,
  remainingSinpeCodeMs,
  SINPE_CODE_TTL_MS,
  sinpeAllowedSenders,
  sinpeReceivePhone,
} from './code.js'
import { AuthError } from '../errors.js'
import { creditLoyaltyFromTreasury } from '../submitPayment.js'
import { calculateRojos, CRC_PER_ROJO, formatRojosAmount } from './convert.js'
import { extractStellarPublicKey, extractPhoneFromSms, parseSinpeSms } from './parseSms.js'
import {
  isTemplatePlaceholder,
  isRouteNoise,
  looksTruncatedSinpeSms,
} from './webhookPayload.js'
import {
  findActiveCodeIssueForUser,
  findByMessageQuery,
  findByReference,
  findCodeIssueByCode,
  isPendingDepositStatus,
  issueSinpeCodeForUser,
  listActiveCodeCodes,
  listUnassignedDeposits,
  listSinpeForUser,
  upsertSinpeTransaction,
  upsertUnassignedDeposit,
} from './store.js'
import type { SinpeCodeIssue, UnassignedDeposit } from './types.js'

type WebhookPayload = {
  sender: string
  message: string
  timestamp: number
}

export async function getSinpeIntent(session: PublicUser) {
  const user = await ensureUserSinpeCode(session.id)
  if (!user) {
    throw new AuthError('No se pudo cargar la cuenta para SINPE', 500)
  }
  const phone = sinpeReceivePhone()
  const now = Date.now()
  const active = await findActiveCodeIssueForUser(user.id, now)
  return buildSinpeIntentResponse({
    phone,
    publicKey: user.publicKey,
    issue: active,
    now,
  })
}

/**
 * Activa (o reutiliza) el código al copiarlo. El TTL de 5 min arranca aquí.
 */
export async function activateSinpeCode(session: PublicUser) {
  const user = await ensureUserSinpeCode(session.id)
  if (!user) {
    throw new AuthError('No se pudo cargar la cuenta para SINPE', 500)
  }
  const phone = sinpeReceivePhone()
  const now = Date.now()
  const existing = await findActiveCodeIssueForUser(user.id, now)
  if (existing) {
    return buildSinpeIntentResponse({
      phone,
      publicKey: user.publicKey,
      issue: existing,
      now,
      activated: false,
    })
  }
  const taken = await listActiveCodeCodes()
  const code = mintEphemeralSinpeCode(taken)
  const issue = await issueSinpeCodeForUser({
    id: randomUUID(),
    userId: user.id,
    publicKey: user.publicKey,
    code,
    now,
  })
  await setUserSinpeCode(user.id, issue.code)
  return buildSinpeIntentResponse({
    phone,
    publicKey: user.publicKey,
    issue,
    now,
    activated: true,
  })
}

function buildSinpeIntentResponse(input: {
  phone: string
  publicKey: string
  issue?: SinpeCodeIssue
  now: number
  activated?: boolean
}) {
  const expiresAt = input.issue?.expiresAt ?? null
  const remainingMs = expiresAt ? remainingSinpeCodeMs(expiresAt, input.now) : 0
  const expired = Boolean(expiresAt && remainingMs <= 0)
  return {
    phone: input.phone,
    phoneDisplay: formatSinpePhone(input.phone),
    code: input.issue && !expired ? input.issue.code : null,
    publicKey: input.publicKey,
    expiresAt: input.issue && !expired ? expiresAt : null,
    issuedAt: input.issue && !expired ? input.issue.issuedAt : null,
    remainingMs,
    ttlMs: SINPE_CODE_TTL_MS,
    serverNow: new Date(input.now).toISOString(),
    status: input.issue && !expired ? ('active' as const) : ('idle' as const),
    activated: input.activated ?? false,
  }
}

export async function processSinpeSmsWebhook(payload: WebhookPayload) {
  const sender = resolveSender(payload.sender, payload.message)
  const senderGate = assertAllowedSender(payload.sender, sender)
  if (senderGate) {
    const now = new Date().toISOString()
    const codes = extractSinpeCodes(payload.message)
    const matched = codes[0]
      ? await resolveDestination(codes[0], payload.message)
      : undefined
    const parsedEarly = parseSinpeSms(payload.message)
    const earlyRef = parsedEarly?.referenceId
    if (earlyRef) {
      const existingBlocked = await findByReference(earlyRef)
      if (
        existingBlocked.transaction?.status === 'COMPLETED' ||
        isResolved(existingBlocked.deposit)
      ) {
        return {
          status: 'duplicate_ignored' as const,
          reason: 'already_credited',
          referenceId: earlyRef,
          senderRejected: true,
          error: senderGate,
        }
      }
    }
    const amounts = parsedEarly
      ? calculateRojos(parsedEarly.crcAmount)
      : { rojos: 0, promoApplied: false }
    const deposit = await upsertUnassignedDeposit({
      id: randomUUID(),
      referenceId: earlyRef ?? `blocked-${Date.now()}`,
      crcAmount: parsedEarly?.crcAmount ?? 0,
      calculatedRojos: amounts.rojos,
      promoApplied: amounts.promoApplied,
      comment: parsedEarly?.comment || codes[0] || '',
      sender,
      rawMessage: isRouteNoise(payload.message) ? '' : payload.message,
      timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
      status: 'PENDING_MANUAL_MATCH',
      lastError: senderGate,
      assignedUserId: matched?.id,
      assignedPublicKey: matched?.publicKey,
      createdAt: now,
      updatedAt: now,
    })
    return {
      status: 'pending_manual_match' as const,
      deposit,
      error: senderGate,
      senderRejected: true,
    }
  }

  const parsed = parseSinpeSms(payload.message)
  if (!parsed) {
    const now = new Date().toISOString()
    const codes = extractSinpeCodes(payload.message)
    const matched = codes[0]
      ? await resolveDestination(codes[0], payload.message)
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
    return {
      status: 'duplicate_ignored' as const,
      reason: existing.deposit?.resolvedByAdminId
        ? 'already_manual'
        : 'already_credited',
      referenceId: parsed.referenceId,
    }
  }
  if (
    isPendingDepositStatus(existing.deposit?.status ?? '') &&
    !existing.transaction &&
    !isRicherSms(payload.message, existing.deposit?.rawMessage ?? '')
  ) {
    return { status: 'duplicate_ignored' as const, reason: 'same_sms' }
  }

  const { rojos, promoApplied } = calculateRojos(parsed.crcAmount)
  const claimedUser = await claimedDestination(existing.deposit)
  const destination =
    claimedUser ?? (await resolveDestination(parsed.comment, payload.message))
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
      assignedUserId: existing.deposit?.assignedUserId,
      assignedPublicKey: existing.deposit?.assignedPublicKey,
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
    if (existing.deposit) {
      await upsertUnassignedDeposit({
        ...existing.deposit,
        crcAmount: parsed.crcAmount,
        calculatedRojos: rojos,
        promoApplied,
        comment: parsed.comment || existing.deposit.comment,
        sender,
        rawMessage: payload.message,
        timestamp,
        status: existing.deposit.status === 'PENDING_USER_CLAIM'
          ? 'RESOLVED_BY_USER_CLAIM'
          : 'RESOLVED',
        assignedUserId: destination.id,
        assignedPublicKey: destination.publicKey,
        stellarHash: credit.hash,
        lastError: undefined,
        resolvedAt: now,
        updatedAt: now,
      })
    }
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
      status: existing.deposit?.status === 'PENDING_USER_CLAIM'
        ? 'PENDING_USER_CLAIM'
        : 'PENDING_MANUAL_MATCH',
      lastError,
      assignedUserId: destination.id ?? existing.deposit?.assignedUserId,
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
  rojosAmount?: number
}) {
  requireReference(input.referenceId)
  if (!input.userId.trim()) {
    throw new AuthError('Selecciona un usuario', 400)
  }
  const referenceId = input.referenceId.trim()
  const { deposit, transaction } = await findByReference(referenceId)
  if (transaction?.status === 'COMPLETED' || isResolved(deposit)) {
    throw new AuthError(
      'Este comprobante ya fue acreditado. Con este número de referencia queda confirmado que ya se dio (no se vuelve a entregar automático).',
      409,
      'already_manual',
    )
  }
  const crcOverride = input.crcAmount
  const rojosOverride = input.rojosAmount
  const now = new Date().toISOString()
  let ready: UnassignedDeposit
  if (!deposit) {
    ready = buildManualDeposit({
      referenceId,
      crcAmount: crcOverride,
      rojosAmount: rojosOverride,
      now,
    })
  } else if (!isPendingDepositStatus(deposit.status)) {
    throw new AuthError('No hay un depósito pendiente con ese comprobante', 404)
  } else {
    ready = withParsedAmounts(deposit)
    if (rojosOverride != null && Number.isFinite(rojosOverride) && rojosOverride > 0) {
      ready = {
        ...ready,
        crcAmount: rojosOverride * CRC_PER_ROJO,
        calculatedRojos: rojosOverride,
        promoApplied: false,
      }
    } else if (crcOverride != null && Number.isFinite(crcOverride) && crcOverride > 0) {
      const { rojos, promoApplied } = calculateRojos(crcOverride)
      ready = {
        ...ready,
        crcAmount: crcOverride,
        calculatedRojos: rojos,
        promoApplied,
      }
    }
  }
  if (!(ready.calculatedRojos > 0)) {
    throw new AuthError('Indica cuántos ROJOS o el monto en colones para acreditar', 400)
  }
  const user = await requireAssignableUser(input.userId)
  const credit = await mintRojosToUser(user, ready.calculatedRojos, ready.referenceId)
  return finalizeManualGrant({
    ready,
    transactionId: transaction?.id,
    transactionCreatedAt: transaction?.createdAt,
    userId: user.id,
    publicKey: user.publicKey,
    adminId: input.adminId,
    stellarHash: credit.hash,
    now,
  })
}

export async function assertReferenceAvailableForManualGrant(referenceId: string) {
  requireReference(referenceId)
  const { deposit, transaction } = await findByReference(referenceId.trim())
  if (transaction?.status === 'COMPLETED' || isResolved(deposit)) {
    throw new AuthError(
      'Este número de referencia ya está marcado como otorgado. No se puede registrar de nuevo.',
      409,
      'already_manual',
    )
  }
}

/** Marks a SINPE reference as already paid after a super-admin ROJOS send (no claim/SMS required). */
export async function markReferenceGrantedByAdmin(input: {
  referenceId: string
  adminId: string
  publicKey: string
  userId?: string
  rojos: number
  stellarHash: string
}) {
  requireReference(input.referenceId)
  if (!(input.rojos > 0) || !Number.isFinite(input.rojos)) {
    throw new AuthError('El monto de ROJOS no es válido', 400)
  }
  const referenceId = input.referenceId.trim()
  const { deposit, transaction } = await findByReference(referenceId)
  if (transaction?.status === 'COMPLETED' || isResolved(deposit)) {
    throw new AuthError(
      'Este número de referencia ya está marcado como otorgado. No se puede registrar de nuevo.',
      409,
      'already_manual',
    )
  }
  const now = new Date().toISOString()
  const ready =
    deposit && isPendingDepositStatus(deposit.status)
      ? {
          ...withParsedAmounts(deposit),
          crcAmount: input.rojos * CRC_PER_ROJO,
          calculatedRojos: input.rojos,
          promoApplied: false,
        }
      : buildManualDeposit({
          referenceId,
          rojosAmount: input.rojos,
          now,
          id: deposit?.id,
          createdAt: deposit?.createdAt,
        })
  return finalizeManualGrant({
    ready,
    transactionId: transaction?.id,
    transactionCreatedAt: transaction?.createdAt,
    userId: input.userId,
    publicKey: input.publicKey,
    adminId: input.adminId,
    stellarHash: input.stellarHash,
    now,
  })
}

function buildManualDeposit(input: {
  referenceId: string
  crcAmount?: number
  rojosAmount?: number
  now: string
  id?: string
  createdAt?: string
}): UnassignedDeposit {
  if (input.rojosAmount != null && Number.isFinite(input.rojosAmount) && input.rojosAmount > 0) {
    return {
      id: input.id ?? randomUUID(),
      referenceId: input.referenceId,
      crcAmount: input.rojosAmount * CRC_PER_ROJO,
      calculatedRojos: input.rojosAmount,
      promoApplied: false,
      comment: '',
      sender: '',
      rawMessage: '',
      timestamp: Date.now(),
      status: 'PENDING_MANUAL_MATCH',
      createdAt: input.createdAt ?? input.now,
      updatedAt: input.now,
    }
  }
  if (input.crcAmount != null && Number.isFinite(input.crcAmount) && input.crcAmount > 0) {
    const { rojos, promoApplied } = calculateRojos(input.crcAmount)
    return {
      id: input.id ?? randomUUID(),
      referenceId: input.referenceId,
      crcAmount: input.crcAmount,
      calculatedRojos: rojos,
      promoApplied,
      comment: '',
      sender: '',
      rawMessage: '',
      timestamp: Date.now(),
      status: 'PENDING_MANUAL_MATCH',
      createdAt: input.createdAt ?? input.now,
      updatedAt: input.now,
    }
  }
  throw new AuthError(
    'Indica cuántos ROJOS o el monto en colones para acreditar este comprobante',
    400,
  )
}

async function finalizeManualGrant(input: {
  ready: UnassignedDeposit
  transactionId?: string
  transactionCreatedAt?: string
  userId?: string
  publicKey: string
  adminId: string
  stellarHash: string
  now: string
}) {
  const resolved = await upsertUnassignedDeposit({
    ...input.ready,
    status: 'RESOLVED',
    assignedUserId: input.userId,
    assignedPublicKey: input.publicKey,
    stellarHash: input.stellarHash,
    resolvedByAdminId: input.adminId,
    resolvedAt: input.now,
    lastError: undefined,
    updatedAt: input.now,
  })
  const completed = await upsertSinpeTransaction({
    id: input.transactionId ?? randomUUID(),
    referenceId: input.ready.referenceId,
    crcAmount: input.ready.crcAmount,
    calculatedRojos: input.ready.calculatedRojos,
    promoApplied: input.ready.promoApplied,
    comment: input.ready.comment,
    sender: input.ready.sender,
    rawMessage: input.ready.rawMessage,
    timestamp: input.ready.timestamp,
    status: 'COMPLETED',
    userId: input.userId,
    publicKey: input.publicKey,
    stellarHash: input.stellarHash,
    notification: successMessage(input.ready.calculatedRojos),
    createdAt: input.transactionCreatedAt ?? input.now,
    updatedAt: input.now,
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
  const referenceId = input.referenceId.trim()
  const { deposit, transaction } = await findByReference(referenceId)
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
  if (deposit && belongsToAnotherAccount(deposit, input.user)) {
    throw new AuthError(
      'El código de esa transacción no coincide con tu cuenta.',
      403,
      'code_mismatch',
    )
  }
  if (!deposit) {
    return queueUserClaim(referenceId, input.user)
  }
  if (deposit.status === 'PENDING_USER_CLAIM') {
    return {
      outcome: 'queued' as const,
      message:
        'Tu reclamo ya está registrado con este número de referencia. La mesa SINPE lo ve y, si el SMS llega después, no se vuelve a acreditar si ya te lo dieron a mano.',
      deposit: withParsedAmounts(deposit),
      rojos: 0,
    }
  }
  if (deposit.status !== 'PENDING_MANUAL_MATCH') {
    throw new AuthError(
      'Ese número no coincide con ningún comprobante que hayamos recibido. Revisa el número o espera unos minutos si acabas de transferir.',
      404,
      'not_found',
    )
  }
  const ready = withParsedAmounts(deposit)
  if (!(ready.calculatedRojos > 0)) {
    const now = new Date().toISOString()
    const queued = await upsertUnassignedDeposit({
      ...ready,
      status: 'PENDING_USER_CLAIM',
      assignedUserId: input.user.id,
      assignedPublicKey: input.user.publicKey,
      lastError:
        'Reclamo del usuario: recibimos el comprobante pero falta el monto legible para acreditar.',
      updatedAt: now,
    })
    return {
      outcome: 'queued' as const,
      message:
        'Registramos tu reclamo con este número de referencia. La mesa SINPE lo verá y podrá acreditarlo a mano.',
      deposit: queued,
      rojos: 0,
    }
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

async function queueUserClaim(referenceId: string, user: PublicUser) {
  const now = new Date().toISOString()
  const deposit = await upsertUnassignedDeposit({
    id: randomUUID(),
    referenceId,
    crcAmount: 0,
    calculatedRojos: 0,
    promoApplied: false,
    comment: '',
    sender: '',
    rawMessage: '',
    timestamp: Date.now(),
    status: 'PENDING_USER_CLAIM',
    lastError:
      'Reclamo del usuario: el SMS aún no llegó o no se emparejó. Otorgá a mano con este número de referencia para que no se entregue de nuevo automáticamente.',
    assignedUserId: user.id,
    assignedPublicKey: user.publicKey,
    createdAt: now,
    updatedAt: now,
  })
  return {
    outcome: 'queued' as const,
    message:
      'Registramos tu reclamo con este número de referencia. Si el mensaje tarda, la mesa SINPE puede acreditarlo a mano y ese mismo número confirma que ya se dio.',
    deposit,
    rojos: 0,
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
  const deposit = found.deposit ? withParsedAmounts(found.deposit) : found.deposit
  const manual =
    Boolean(deposit?.resolvedByAdminId) ||
    (deposit?.status === 'RESOLVED' && Boolean(deposit.resolvedAt))
  const suggestion = await suggestUserForDeposit(deposit, found.transaction)
  return {
    deposit,
    transaction: found.transaction,
    manualGrant: manual,
    alreadyFulfilled:
      found.transaction?.status === 'COMPLETED' || isResolved(found.deposit),
    suggestedUser: suggestion?.user,
    matchedCode: suggestion?.matchedCode,
    suggestionReason: suggestion?.reason,
  }
}

async function suggestUserForDeposit(
  deposit?: UnassignedDeposit,
  transaction?: { userId?: string; publicKey?: string; comment?: string },
): Promise<
  | {
      user: PublicUser
      matchedCode?: string
      reason: 'assigned' | 'code' | 'transaction'
    }
  | undefined
> {
  if (deposit?.assignedUserId) {
    const user = await findUserById(deposit.assignedUserId)
    if (user && isSuggestableAccount(user)) {
      const codes = extractSinpeCodes(deposit.comment, deposit.rawMessage)
      return {
        user: toPublicUser(user),
        matchedCode: codes[0],
        reason: 'assigned',
      }
    }
  }
  if (transaction?.userId) {
    const user = await findUserById(transaction.userId)
    if (user && isSuggestableAccount(user)) {
      return {
        user: toPublicUser(user),
        matchedCode: extractSinpeCodes(transaction.comment ?? '')[0],
        reason: 'transaction',
      }
    }
  }
  const haystack = [
    deposit?.comment ?? '',
    deposit?.rawMessage ?? '',
    transaction?.comment ?? '',
  ]
  for (const code of extractSinpeCodes(...haystack)) {
    const byIssue = await resolveByIssuedCode(code)
    if (byIssue?.id) {
      const user = await findUserById(byIssue.id)
      if (user && isSuggestableAccount(user)) {
        return { user: toPublicUser(user), matchedCode: code, reason: 'code' }
      }
    }
    const byCode = await findUserBySinpeCode(code)
    if (byCode && isSuggestableAccount(byCode)) {
      return { user: toPublicUser(byCode), matchedCode: code, reason: 'code' }
    }
  }
  const publicKey = deposit?.assignedPublicKey || transaction?.publicKey
  if (publicKey) {
    const byKey = await findUserByPublicKey(publicKey)
    if (byKey && isSuggestableAccount(byKey)) {
      return {
        user: toPublicUser(byKey),
        matchedCode: extractSinpeCodes(...haystack)[0],
        reason: 'assigned',
      }
    }
  }
  return undefined
}

function isSuggestableAccount(user: StoredUser) {
  return user.role === 'customer' || user.role === 'merchant'
}

export function listPendingDeposits(query?: string) {
  return listUnassignedDeposits({
    query,
    status: query ? 'ALL' : 'PENDING_ANY',
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
    const byIssue = await resolveByIssuedCode(sinpeCode)
    if (byIssue) {
      return byIssue
    }
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

/**
 * Empareja por historial de códigos emitidos (activos o vencidos).
 * Un SMS con código vencido sigue acreditando a quien lo copió.
 */
async function resolveByIssuedCode(
  sinpeCode: string,
): Promise<{ id?: string; publicKey: string } | undefined> {
  const issue = await findCodeIssueByCode(sinpeCode)
  if (!issue) {
    return undefined
  }
  const user = await findUserById(issue.userId)
  if (user) {
    return user
  }
  return { id: issue.userId, publicKey: issue.publicKey }
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
    return `No hay cuenta con el código de la nota (${comment}). Si el cliente usó un código inventado o muy antiguo, pedile el número de comprobante y acreditalo desde la mesa.`
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
  // Solo como etiqueta de mesa: si hay allowlist, no se acredita sin `from` real.
  return extractPhoneFromSms(message) ?? raw
}

/**
 * Si SINPE_SMS_ALLOWED_SENDERS está configurado, el SMS debe traer `from`
 * de ese número (p. ej. el corto del BAC). Si no, va a mesa y no acredita solo.
 */
function assertAllowedSender(
  rawFrom: string,
  resolvedSender: string,
): string | undefined {
  const allowed = sinpeAllowedSenders()
  if (allowed.length === 0) {
    return undefined
  }
  const raw = rawFrom.trim()
  const missing =
    !raw ||
    /^\{.+\}$/.test(raw) ||
    raw.toLowerCase() === 'from' ||
    raw.toLowerCase() === 'sender'
  if (missing) {
    return `Falta el número de origen del SMS (from). En Forwarder mandá "from": "%from%" o "%number%". Solo se acreditan automáticos de: ${allowed.join(', ')}.`
  }
  if (!isAllowedSinpeSender(raw) && !isAllowedSinpeSender(resolvedSender)) {
    return `Remitente no autorizado (${raw}). Solo se acreditan SMS de: ${allowed.join(', ')}. Revisá en mesa si el banco cambió de número.`
  }
  return undefined
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

async function claimedDestination(
  deposit?: UnassignedDeposit,
): Promise<{ id?: string; publicKey: string } | undefined> {
  if (!deposit?.assignedUserId && !deposit?.assignedPublicKey) {
    return undefined
  }
  if (deposit.assignedUserId) {
    const user = await findUserById(deposit.assignedUserId)
    if (user) {
      return user
    }
  }
  if (deposit.assignedPublicKey) {
    return { publicKey: deposit.assignedPublicKey }
  }
  return undefined
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
