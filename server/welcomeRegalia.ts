import { creditLoyaltyFromTreasury } from './submitPayment.js'

/**
 * Regalía de bienvenida (apagada por defecto para el piloto).
 * Solo se acredita si WELCOME_REGALIA=1 (o true/on).
 */
export const WELCOME_REGALIA_AMOUNT = '3'
export const WELCOME_REGALIA_MEMO = 'regalia'

export function welcomeRegaliaEnabled(): boolean {
  const flag = (process.env.WELCOME_REGALIA ?? '').trim().toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'on'
}

/** Acredita 3 ROJOS una sola vez. El llamador solo debe usarlo al crear la cuenta. */
export async function grantWelcomeRegalia(publicKey: string): Promise<boolean> {
  if (!welcomeRegaliaEnabled()) {
    return false
  }
  await creditLoyaltyFromTreasury({
    destination: publicKey,
    amount: WELCOME_REGALIA_AMOUNT,
    memo: WELCOME_REGALIA_MEMO,
  })
  return true
}
