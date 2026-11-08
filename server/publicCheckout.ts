/** Circle USDC on the Stellar public network. */
export const CIRCLE_USDC_ISSUER =
  'GA5ZSEJYB37JRC5RCJAELWUHTMYHMEKPVGFBMDLM5AH4VEKBE4SKZU7Z'

/** Same platform fee the event contract already uses when the venue turns it on. */
export const PLATFORM_FEE_BPS = 250

export type PublicCheckoutTarget = {
  network: 'public'
  assetCode: 'USDC'
  issuer: string
  feeBps: number
  contractId: string | null
  status: 'pendiente' | 'contrato'
  note: string
}

/**
 * First Instaward cut: one SKU settled in Circle USDC on the public network.
 * A contract id in ESCROW_PUBLIC_CONTRACT_ID means the contract exists.
 * It does not mean a payment happened. That still needs a transaction hash.
 */
export function publicCheckoutTarget(): PublicCheckoutTarget {
  const contractId = (process.env.ESCROW_PUBLIC_CONTRACT_ID ?? '').trim()
  return {
    network: 'public',
    assetCode: 'USDC',
    issuer: CIRCLE_USDC_ISSUER,
    feeBps: PLATFORM_FEE_BPS,
    contractId: contractId || null,
    status: contractId ? 'contrato' : 'pendiente',
    note: 'El 14 y el 21 de noviembre el evento sigue en testnet: el saldo es dinero real. El evento siguiente cobra en la red pública. El Instaward paga esa migración: base de datos, cambio visual y de marca, y el contrato con la custodia de Eurek Corp ante la SUGEF. Sin hash de esa red, mainnet no está hecho.',
  }
}
