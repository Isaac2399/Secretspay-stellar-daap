import { randomUUID } from 'node:crypto'
import { Horizon } from '@stellar/stellar-sdk'
import {
  ensureUserLoyaltyTrustline,
  findUserById,
  superAdminPublicKey,
  type PublicUser,
} from '../auth.js'
import { AuthError } from '../errors.js'
import { horizonUrl, loyaltyAssetFromEnv } from '../provisionAccount.js'
import { formatSinpePhone } from '../sinpe/code.js'
import { calculateRojos, CRC_PER_ROJO, formatRojosAmount } from '../sinpe/convert.js'
import { creditLoyaltyFromTreasury, submitCustodialPayment } from '../submitPayment.js'
import {
  insertCashCredit,
  insertCashRefund,
  listCashCredits,
  listCashRefunds,
  markCashRefundPaid,
} from './store.js'
import type { CashCredit, CashRefund } from './types.js'

export async function creditCashAtEvent(input: {
  userId: string
  crcAmount: number
  cashier: PublicUser
}): Promise<{ credit: CashCredit; message: string }> {
  const crcAmount = Number(input.crcAmount)
  if (!Number.isFinite(crcAmount) || crcAmount <= 0) {
    throw new AuthError('Indica el monto en colones recibido', 400)
  }
  if (!input.userId.trim()) {
    throw new AuthError('Selecciona un usuario', 400)
  }
  const user = await findUserById(input.userId)
  if (!user) {
    throw new AuthError('El usuario no existe', 404)
  }
  if (user.role !== 'customer' && user.role !== 'merchant') {
    throw new AuthError('Esa cuenta no puede recibir recargas', 400)
  }

  const { rojos, promoApplied } = calculateRojos(crcAmount)
  await ensureUserLoyaltyTrustline(user.id)
  const memo = `CAJA ${input.userId}`.slice(0, 28)
  const paid = await creditLoyaltyFromTreasury({
    destination: user.publicKey,
    amount: formatRojosAmount(rojos),
    memo,
  })

  const credit = await insertCashCredit({
    id: randomUUID(),
    crcAmount,
    calculatedRojos: rojos,
    promoApplied,
    userId: user.id,
    publicKey: user.publicKey,
    email: user.email,
    cashierId: input.cashier.id,
    cashierEmail: input.cashier.email,
    stellarHash: paid.hash,
    createdAt: new Date().toISOString(),
  })

  const display = Number.isInteger(rojos) ? String(rojos) : String(rojos)
  return {
    credit,
    message: `Se acreditaron ${display} ROJOS a ${user.email}`,
  }
}

export function listRecentCashCredits() {
  return listCashCredits(40)
}

export function listRecentCashRefunds() {
  return listCashRefunds(80)
}

function refundPhone(raw: string): { phone: string; phoneDisplay: string } {
  const digits = raw.replace(/\D/g, '')
  const local =
    digits.startsWith('506') && digits.length === 11 ? digits.slice(3) : digits
  if (!/^\d{8}$/.test(local)) {
    throw new AuthError(
      'Escribe el teléfono de 8 dígitos donde quieres recibir el SINPE',
      400,
    )
  }
  return { phone: local, phoneDisplay: formatSinpePhone(local) }
}

/** Devuelve el saldo ROJOS a la tesorería y deja el SINPE pendiente al teléfono indicado. */
export async function refundCustomerBalance(
  user: PublicUser,
  phoneRaw: string,
): Promise<{ refund: CashRefund; message: string }> {
  if (user.role !== 'customer') {
    throw new AuthError('Solo un cliente del evento puede reembolsar su saldo', 403)
  }
  const { phone, phoneDisplay } = refundPhone(phoneRaw)
  const loyalty = loyaltyAssetFromEnv()
  if (!loyalty) {
    throw new AuthError('El token de lealtad no está configurado', 503)
  }
  const server = new Horizon.Server(horizonUrl())
  const account = await server.loadAccount(user.publicKey)
  const raw = account.balances.find((entry) => {
    if (entry.asset_type === 'native' || entry.asset_type === 'liquidity_pool_shares') {
      return false
    }
    return (
      entry.asset_code === loyalty.getCode() && entry.asset_issuer === loyalty.getIssuer()
    )
  })
  const available = raw && 'balance' in raw ? raw.balance : '0'
  const rojos = Number(available)
  if (!Number.isFinite(rojos) || rojos <= 0) {
    throw new AuthError('No tienes ROJOS para reembolsar', 400)
  }
  const amount = formatRojosAmount(rojos)
  const destination = superAdminPublicKey()
  const paid = await submitCustodialPayment({
    userId: user.id,
    destination,
    amount,
    asset: loyalty.getCode(),
    memo: 'REEMBOLSO',
  })
  const crcAmount = Math.round(Number(amount) * CRC_PER_ROJO)
  const refund = await insertCashRefund({
    id: randomUUID(),
    userId: user.id,
    email: user.email,
    publicKey: user.publicKey,
    rojos: amount,
    crcAmount,
    phone,
    phoneDisplay,
    stellarHash: paid.hash,
    status: 'pending_cash',
    createdAt: new Date().toISOString(),
  })
  const colones = crcAmount.toLocaleString('es-CR')
  return {
    refund,
    message: `Reembolso listo. Te enviamos ₡${colones} por SINPE Móvil al ${phoneDisplay}.`,
  }
}

export async function settleCashRefund(input: {
  id: string
  cashier: PublicUser
}): Promise<CashRefund> {
  const id = input.id.trim()
  if (!id) {
    throw new AuthError('Falta el reembolso', 400)
  }
  return markCashRefundPaid(id, input.cashier.email)
}
