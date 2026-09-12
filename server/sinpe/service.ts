import { randomUUID } from 'node:crypto'
import {
  ensureUserLoyaltyTrustline,
  findUserByEmail,
  findUserById,
  findUserByPublicKey,
  findUserBySinpeCode,
  type PublicUser,
} from '../auth.js'
import { extractSinpeCodes } from './code.js'
import { AuthError } from '../errors.js'
import { creditLoyaltyFromTreasury } from '../submitPayment.js'
import { calculateRojos, formatRojosAmount } from './convert.js'
import { extractStellarPublicKey, extractPhoneFromSms, parseSinpeSms } from './parseSms.js'
import {
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

export async function processSinpeSmsWebhook(payload: WebhookPayload) {
  const sender = resolveSender(payload.sender, payload.message)
  const parsed = parseSinpeSms(payload.message)
  if (!parsed) {
    const now = new Date().toISOString()
    const deposit = await upsertUnassignedDeposit({
      id: randomUUID(),
      referenceId: `unparsed-${Date.now()}`,
      crcAmount: 0,
      calculatedRojos: 0,
      promoApplied: false,
      comment: '',
      sender,
      rawMessage: payload.message,
      timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
      status: 'PENDING_MANUAL_MATCH',
      lastError: 'SMS no reconocido (monto o referencia)',
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
  if (existing.deposit?.status === 'PENDING_MANUAL_MATCH' && !existing.transaction) {
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
      lastError: parsed.comment
        ? `No hay cuenta con el código de la nota (${parsed.comment})`
        : 'La nota del SINPE no trajo el código de 6 caracteres',
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
  const user = await requireAssignableUser(input.userId)
  const credit = await mintRojosToUser(user, deposit.calculatedRojos, deposit.referenceId)
  const now = new Date().toISOString()
  const resolved = await upsertUnassignedDeposit({
    ...deposit,
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
    referenceId: deposit.referenceId,
    crcAmount: deposit.crcAmount,
    calculatedRojos: deposit.calculatedRojos,
    promoApplied: deposit.promoApplied,
    comment: deposit.comment,
    sender: deposit.sender,
    rawMessage: deposit.rawMessage,
    timestamp: deposit.timestamp,
    status: 'COMPLETED',
    userId: user.id,
    publicKey: user.publicKey,
    stellarHash: credit.hash,
    notification: successMessage(deposit.calculatedRojos),
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
      const credit = await mintRojosToUser(
        user,
        deposit.calculatedRojos,
        deposit.referenceId,
      )
      const now = new Date().toISOString()
      await upsertUnassignedDeposit({
        ...deposit,
        status: 'RESOLVED',
        stellarHash: credit.hash,
        lastError: undefined,
        resolvedAt: now,
        updatedAt: now,
      })
      await upsertSinpeTransaction({
        id: randomUUID(),
        referenceId: deposit.referenceId,
        crcAmount: deposit.crcAmount,
        calculatedRojos: deposit.calculatedRojos,
        promoApplied: deposit.promoApplied,
        comment: deposit.comment,
        sender: deposit.sender,
        rawMessage: deposit.rawMessage,
        timestamp: deposit.timestamp,
        status: 'COMPLETED',
        userId,
        publicKey: user.publicKey,
        stellarHash: credit.hash,
        notification: successMessage(deposit.calculatedRojos),
        createdAt: now,
        updatedAt: now,
      })
      results.push({ referenceId: deposit.referenceId, ok: true, hash: credit.hash })
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
    throw new AuthError('Este comprobante ya fue acreditado', 409)
  }
  if (!deposit || deposit.status !== 'PENDING_MANUAL_MATCH') {
    throw new AuthError(
      'Comprobante no encontrado. Si acabas de hacer la transferencia, espera unos minutos o contacta a soporte',
      404,
    )
  }
  const user = await requireAssignableUser(input.user.id)
  const credit = await mintRojosToUser(user, deposit.calculatedRojos, deposit.referenceId)
  const now = new Date().toISOString()
  const resolved = await upsertUnassignedDeposit({
    ...deposit,
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
    referenceId: deposit.referenceId,
    crcAmount: deposit.crcAmount,
    calculatedRojos: deposit.calculatedRojos,
    promoApplied: deposit.promoApplied,
    comment: deposit.comment,
    sender: deposit.sender,
    rawMessage: deposit.rawMessage,
    timestamp: deposit.timestamp,
    status: 'COMPLETED',
    userId: user.id,
    publicKey: user.publicKey,
    stellarHash: credit.hash,
    notification: successMessage(deposit.calculatedRojos),
    createdAt: transaction?.createdAt ?? now,
    updatedAt: now,
  })
  return {
    message: `¡Comprobante verificado! Se acreditaron ${formatRojosDisplay(deposit.calculatedRojos)} ROJOS a tu billetera`,
    deposit: resolved,
    rojos: deposit.calculatedRojos,
    stellarHash: credit.hash,
  }
}

export async function lookupSinpeClaim(referenceId: string) {
  requireReference(referenceId)
  const found = await findByReference(referenceId)
  if (!found.deposit && !found.transaction) {
    throw new AuthError('Comprobante no encontrado', 404)
  }
  return found
}

export function listPendingDeposits(referenceId?: string) {
  return listUnassignedDeposits({
    referenceId,
    status: referenceId ? 'ALL' : 'PENDING_MANUAL_MATCH',
  })
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
    if (byCode) {
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

async function requireAssignableUser(userId: string) {
  const user = await findUserById(userId)
  if (!user) {
    throw new AuthError('El usuario no existe', 404)
  }
  return user
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
    throw new AuthError('Indica el número de comprobante', 400)
  }
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
