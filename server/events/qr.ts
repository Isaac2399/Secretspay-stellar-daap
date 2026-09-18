const PREFIX = 'BAR1|'

export function serializePickupQr(orderId: string, pickupToken: string): string {
  return `${PREFIX}${orderId}|${pickupToken}`
}

export function parsePickupQr(raw: string): { orderId: string; pickupToken: string } {
  const trimmed = raw.trim()
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error('El QR no es de un pedido de barra')
  }
  const parts = trimmed.split('|')
  if (parts.length < 3 || !parts[1] || !parts[2]) {
    throw new Error('QR de pedido incompleto')
  }
  return { orderId: parts[1], pickupToken: parts[2] }
}
