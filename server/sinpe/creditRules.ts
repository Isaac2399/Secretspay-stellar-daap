import { calculateRojos } from './convert.js'
import { parseSinpeSms } from './parseSms.js'

export function amountFromBankText(message: string):
  | { crcAmount: number; rojos: number; promoApplied: boolean }
  | undefined {
  const parsed = parseSinpeSms(message)
  if (!parsed) {
    return undefined
  }
  try {
    const priced = calculateRojos(parsed.crcAmount)
    if (!(priced.rojos > 0)) {
      return undefined
    }
    return {
      crcAmount: parsed.crcAmount,
      rojos: priced.rojos,
      promoApplied: priced.promoApplied,
    }
  } catch {
    return undefined
  }
}

/** ₡4.500 o ₡4,50 guardados en vez de ₡4,500. El SMS completo reemplaza ese monto. */
export function bankAmountReplaces(storedCrc: number, nextCrc: number): boolean {
  return storedCrc > 0 && nextCrc >= storedCrc * 10 && nextCrc - storedCrc >= 100
}

/** El crédito automático sale solo si el código del comprobante es de esa cuenta. */
export function autoCreditDecision(input: {
  ownerId?: string
  claimedId?: string
}): 'credit' | 'hold' {
  if (!input.ownerId) {
    return 'hold'
  }
  if (input.claimedId && input.claimedId !== input.ownerId) {
    return 'hold'
  }
  return 'credit'
}

/** El reclamo con sesión solo acredita al dueño del código, con el monto del banco. */
export function claimCreditDecision(input: {
  ownerId?: string
  userId: string
  bankRojos?: number
}): 'credit' | 'mismatch' | 'queue' {
  if (input.ownerId && input.ownerId !== input.userId) {
    return 'mismatch'
  }
  if (!input.ownerId || !(input.bankRojos && input.bankRojos > 0)) {
    return 'queue'
  }
  return 'credit'
}
