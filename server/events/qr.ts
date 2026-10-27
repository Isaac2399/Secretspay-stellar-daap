const PREFIX = 'BAR1|'
const PAYMENT_PREFIX = 'SP1|'

export function serializePickupQr(orderId: string, pickupToken: string): string {
  return `${PREFIX}${orderId}|${pickupToken}`
}

export function parsePickupQr(raw: string): { orderId: string; pickupToken: string } {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('No se leyó ningún código')
  }
  if (trimmed.startsWith(PAYMENT_PREFIX)) {
    throw new Error('Ese QR es de pago, no de retiro de pedido')
  }
  if (!trimmed.startsWith(PREFIX)) {
    throw new Error('El QR no es de un pedido de barra')
  }
  const parts = trimmed.split('|')
  if (parts.length !== 3 || parts[0] !== 'BAR1' || !parts[1] || !parts[2]) {
    throw new Error('QR de pedido incompleto o manipulado')
  }
  const orderId = parts[1].trim()
  const pickupToken = parts[2].trim()
  if (!/^[0-9a-f-]{8,64}$/i.test(orderId)) {
    throw new Error('QR de pedido inválido')
  }
  if (!/^[0-9a-f]{12,64}$/i.test(pickupToken)) {
    throw new Error('QR de pedido inválido')
  }
  return { orderId, pickupToken }
}
