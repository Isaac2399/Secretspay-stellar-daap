import { randomUUID } from 'node:crypto'
import {
  ensureUserLoyaltyTrustline,
  findUserById,
  type PublicUser,
} from '../auth.js'
import { AuthError } from '../errors.js'
import { calculateRojos, formatRojosAmount } from '../sinpe/convert.js'
import { creditLoyaltyFromTreasury } from '../submitPayment.js'
import { insertCashCredit, listCashCredits } from './store.js'
import type { CashCredit } from './types.js'

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
