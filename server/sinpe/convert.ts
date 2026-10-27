/** Paridad base: ₡1,000 CRC = 1 ROJO. Sin promo: lo que pagan es lo que reciben. */
export const CRC_PER_ROJO = 1000

export function calculateRojos(crcAmount: number): {
  rojos: number
  promoApplied: boolean
} {
  if (!Number.isFinite(crcAmount) || crcAmount <= 0) {
    throw new Error('El monto en colones no es válido')
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
