/** Paridad base: ₡1,000 CRC = 1 ROJO. */
export const CRC_PER_ROJO = 1000

/** Paquete promocional: ₡9,000 acredita 10 ROJOS (1 token extra). */
export const PROMO_CRC_AMOUNT = 9000
export const PROMO_ROJOS_AMOUNT = 10

export function calculateRojos(crcAmount: number): {
  rojos: number
  promoApplied: boolean
} {
  if (!Number.isFinite(crcAmount) || crcAmount <= 0) {
    throw new Error('El monto en colones no es válido')
  }
  if (Math.abs(crcAmount - PROMO_CRC_AMOUNT) < 0.009) {
    return { rojos: PROMO_ROJOS_AMOUNT, promoApplied: true }
  }
  const rojos = roundRojos(crcAmount / CRC_PER_ROJO)
  if (rojos <= 0) {
    return { rojos: 0.0000001, promoApplied: false }
  }
  return { rojos, promoApplied: false }
}

export function roundRojos(value: number): number {
  return Number(value.toFixed(7))
}

export function formatRojosAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('El monto de ROJOS no es válido')
  }
  const fixed = roundRojos(value).toFixed(7)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return trimmed || '0'
}
