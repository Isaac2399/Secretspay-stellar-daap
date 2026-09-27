import { creditLoyaltyFromTreasury } from './submitPayment.js'

/**
 * Regalía temporal de bienvenida para cuentas nuevas.
 * Para apagarla sin borrar código: WELCOME_REGALIA=0
 * Para quitarla: borra este archivo y la llamada en persistNewUser.
 */
export const WELCOME_REGALIA_AMOUNT = '3'
export const WELCOME_REGALIA_MEMO = 'regalia'

export function welcomeRegaliaEnabled(): boolean {
  const flag = (process.env.WELCOME_REGALIA ?? '').trim().toLowerCase()
  return flag !== '0' && flag !== 'false' && flag !== 'off'
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
